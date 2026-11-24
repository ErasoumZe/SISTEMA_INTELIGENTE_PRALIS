import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../../api/src/env.js";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql, json } from "../../setup/integracao.js";

// Leitura das vendas pelo S2 (sistema do Rodrigo): Bearer proprio, uma empresa so (a de S2_LEITURA_EMPRESA_ID),
// os MESMOS numeros do Relatorio de Vendas e nenhum dado de cliente.
const TOKEN = "s2-leitura-".padEnd(48, "x");
const DIA = "2026-08-20"; // dia isolado (sem vendas do seed)

type Pagina = { data: Array<Record<string, unknown>>; meta: { pagination: { total: number } } };

describe("vendas - leitura pelo S2", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin = "";
  const original = { token: env.S2_LEITURA_TOKEN, empresa: env.S2_LEITURA_EMPRESA_ID };

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");

    const inserir = (empresaId: string, descricao: string, quando: string, valor: string) =>
      consultarUm<{ id: string }>(
        `insert into vendas (empresa_id, pdv_id, cliente_id, data_referencia, data_venda, descricao, valor_original,
                             status, computar)
         values ($1, $2, $3, $4::date, $5, $6, $7, 'aprovado', true) returning id`,
        [
          empresaId,
          empresaId === idsTeste.empresaA ? idsTeste.pdvLivre : null,
          empresaId === idsTeste.empresaA ? idsTeste.cliente : null,
          DIA,
          quando,
          descricao,
          valor
        ]
      );
    // 07:30 e 15:00 em Brasilia (UTC-3) na empresa A; uma venda da empresa B que o S2 nunca pode ver.
    const manha = await inserir(idsTeste.empresaA, "S2 manha", "2026-08-20T10:30:00Z", "30.00");
    await inserir(idsTeste.empresaA, "S2 tarde", "2026-08-20T18:00:00Z", "20.00");
    await inserir(idsTeste.empresaB, "S2 outra empresa", "2026-08-20T12:00:00Z", "999.00");
    await executarSql(
      `insert into vendas_pagamentos (venda_id, forma_pagamento_id, numero_vendas, total_pago) values ($1,$2,1,'30.00')`,
      [manha!.id, idsTeste.formaPagamentoDinheiro]
    );
  }, 180_000);

  afterAll(async () => {
    env.S2_LEITURA_TOKEN = original.token;
    env.S2_LEITURA_EMPRESA_ID = original.empresa;
    await executarSql("delete from vendas where descricao like 'S2 %'");
    await contexto.fechar();
  });

  const pedir = (url: string, token?: string) =>
    contexto.app.inject({
      method: "GET",
      url,
      headers: token ? { authorization: `Bearer ${token}` } : {}
    });

  it("Deve_FicarDesligado_SemTokenConfigurado", async () => {
    env.S2_LEITURA_TOKEN = "";
    env.S2_LEITURA_EMPRESA_ID = idsTeste.empresaA;
    assertProblem(await pedir(`/api/s2/vendas?dataInicio=${DIA}&dataFim=${DIA}`, TOKEN), 503, "S2_LEITURA_DESLIGADA");
  });

  it("Deve_RecusarTokenErrado_E_SessaoDeUsuario", async () => {
    env.S2_LEITURA_TOKEN = TOKEN;
    env.S2_LEITURA_EMPRESA_ID = idsTeste.empresaA;
    assertProblem(await pedir("/api/s2/vendas", "y".repeat(48)), 401, "S2_TOKEN_INVALIDO");
    assertProblem(await pedir("/api/s2/vendas/totais"), 401, "S2_TOKEN_INVALIDO");
    // A sessao do ERP nao abre esta porta: ela e so do S2.
    const comSessao = await contexto.app.inject({
      method: "GET",
      url: "/api/s2/vendas/opcoes",
      headers: { cookie: cookieAdmin }
    });
    assertProblem(comSessao, 401, "S2_TOKEN_INVALIDO");
  });

  it("Deve_ListarSoAEmpresaDaLoja_SemDadosDeCliente", async () => {
    env.S2_LEITURA_TOKEN = TOKEN;
    env.S2_LEITURA_EMPRESA_ID = idsTeste.empresaA;
    // empresaId na URL e ignorado: o S2 nao escolhe empresa.
    const resposta = await pedir(
      `/api/s2/vendas?dataInicio=${DIA}&dataFim=${DIA}&empresaId=${idsTeste.empresaB}&ordem=asc`,
      TOKEN
    );
    expect(resposta.statusCode, resposta.body).toBe(200);
    const pagina = json<Pagina>(resposta);
    expect(pagina.data.map((venda) => venda["descricao"])).toEqual(["S2 manha", "S2 tarde"]);
    for (const venda of pagina.data) {
      expect(venda).not.toHaveProperty("clienteId");
      expect(venda).not.toHaveProperty("clienteNome");
      expect(venda).not.toHaveProperty("empresaId");
      expect(venda).not.toHaveProperty("colaboradorId");
      expect(venda).not.toHaveProperty("cancelamentoAutorizadoPorAutomacao");
    }
  });

  it("Deve_DarOsMesmosTotaisDoRelatorioDeVendas", async () => {
    env.S2_LEITURA_TOKEN = TOKEN;
    env.S2_LEITURA_EMPRESA_ID = idsTeste.empresaA;
    const doS2 = await pedir(`/api/s2/vendas/totais?dataInicio=${DIA}&dataFim=${DIA}`, TOKEN);
    const doRelatorio = await contexto.app.inject({
      method: "GET",
      url: `/api/relatorios/vendas/totais?empresaId=${idsTeste.empresaA}&dataInicio=${DIA}&dataFim=${DIA}`,
      headers: { cookie: cookieAdmin }
    });
    expect(doS2.statusCode, doS2.body).toBe(200);
    expect(json<{ data: unknown }>(doS2).data).toEqual(json<{ data: unknown }>(doRelatorio).data);
    expect(json<{ data: { totalGeral: number; quantidade: number } }>(doS2).data).toMatchObject({
      totalGeral: 50,
      quantidade: 2
    });
  });

  it("Deve_FiltrarPelaJanelaDiaria_NaHoraDeBrasilia", async () => {
    env.S2_LEITURA_TOKEN = TOKEN;
    env.S2_LEITURA_EMPRESA_ID = idsTeste.empresaA;
    const manha = json<Pagina>(
      await pedir(`/api/s2/vendas?dataInicio=${DIA}&dataFim=${DIA}&horaDoDiaInicio=06:00&horaDoDiaFim=12:00`, TOKEN)
    );
    expect(manha.data.map((venda) => venda["descricao"])).toEqual(["S2 manha"]);
    // Inicio maior que o fim cruza a meia-noite: 14:00 ate 02:00 pega so a da tarde.
    const noite = json<Pagina>(
      await pedir(`/api/s2/vendas?dataInicio=${DIA}&dataFim=${DIA}&horaDoDiaInicio=14:00&horaDoDiaFim=02:00`, TOKEN)
    );
    expect(noite.data.map((venda) => venda["descricao"])).toEqual(["S2 tarde"]);
    assertProblem(await pedir(`/api/s2/vendas?horaDoDiaInicio=25:00`, TOKEN), 400);
  });

  it("Deve_EntregarAsOpcoesDosFiltros_DaEmpresaDaLoja", async () => {
    env.S2_LEITURA_TOKEN = TOKEN;
    env.S2_LEITURA_EMPRESA_ID = idsTeste.empresaA;
    const resposta = await pedir("/api/s2/vendas/opcoes", TOKEN);
    expect(resposta.statusCode, resposta.body).toBe(200);
    const { data } = json<{
      data: { pdvs: Array<{ id: string }>; formasPagamento: Array<{ id: string }>; turnos: unknown[] };
    }>(resposta);
    expect(data.pdvs.map((pdv) => pdv.id)).toContain(idsTeste.pdvLivre);
    expect(data.formasPagamento.map((forma) => forma.id)).toContain(idsTeste.formaPagamentoDinheiro);
    expect(Array.isArray(data.turnos)).toBe(true);
  });
});
