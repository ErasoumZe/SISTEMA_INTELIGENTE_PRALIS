// Entradas do dia (PROJECT_BRAIN/17, D7 — S6): "a tela lista TODAS as entradas do dia".
//
// O "TODAS" e o ponto. A venda integrada do CREARE so recebe caixa_id quando existe um caixa aberto
// NAQUELE PDV no instante da venda; a venda da madrugada, a de antes da abertura e a de PDV sem
// caixa ficam com caixa_id NULL. Sob o filtro por caixa elas sumiam justamente da tela do operador,
// que e quem precisa conferir o dia.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { executarSql, json } from "../../setup/integracao.js";

// Dia do caixa aberto do operadorEntradas (tests/setup/seed). Dia PROPRIO: o teste cria aqui todas
// as vendas de que precisa, em vez de depender do seed de outro teste.
const DIA_DO_CAIXA = "2026-07-01";

describe("entradas do dia (D7) integration", () => {
  let contexto: ContextoApiTeste;
  let cookieOperador: string;
  let cookieAdmin: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieOperador = await cookieSessao(contexto.app, "operadorEntradas");
    cookieAdmin = await cookieSessao(contexto.app, "admin");

    // Venda integrada SEM caixa (o caso real: vendida fora de um periodo de caixa aberto no PDV).
    await executarSql(
      `insert into vendas (id, empresa_id, caixa_id, data_referencia, descricao, valor_original, computar, status)
       values ($1, $2, null, $3, 'Venda integrada sem caixa', '10.00', true, 'aprovado')`,
      [idsTeste.vendaSemCaixaDoDia, idsTeste.empresaA, DIA_DO_CAIXA]
    );
    // Mesma situacao, mas de OUTRO dia: nao pode aparecer.
    await executarSql(
      `insert into vendas (id, empresa_id, caixa_id, data_referencia, descricao, valor_original, computar, status)
       values ($1, $2, null, $3, 'Venda integrada de outro dia', '99.00', true, 'aprovado')`,
      [idsTeste.vendaSemCaixaOutroDia, idsTeste.empresaA, "2026-06-25"]
    );
    // Venda COM caixa, no mesmo dia: prova que o escopo passou a ser o DIA (antes, o operador so
    // veria as do PROPRIO caixa).
    await executarSql(
      `insert into vendas (id, empresa_id, caixa_id, data_referencia, descricao, valor_original, computar, status)
       values ($1, $2, $3, $4, 'Venda com caixa do dia', '20.00', true, 'aprovado')`,
      [idsTeste.vendaComCaixaDoDia, idsTeste.empresaA, idsTeste.caixaAbertoEntradas, DIA_DO_CAIXA]
    );
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  async function entradas(cookie: string, extra = "") {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/vendas?empresaId=${idsTeste.empresaA}&pageSize=100${extra}`,
      headers: { cookie }
    });
    assertOk(resposta);
    return json<{ data: Array<{ id: string; descricao: string }> }>(resposta).data;
  }

  it("o operador ve a venda integrada SEM caixa do seu dia", async () => {
    const lista = await entradas(cookieOperador);
    const ids = lista.map((venda) => venda.id);
    // O caso que o D7 conserta: sob o filtro por caixa esta venda era invisivel para ele.
    expect(ids).toContain(idsTeste.vendaSemCaixaDoDia);
  });

  it("o operador ve tambem a venda COM caixa do mesmo dia", async () => {
    const ids = (await entradas(cookieOperador)).map((venda) => venda.id);
    expect(ids).toContain(idsTeste.vendaComCaixaDoDia);
  });

  it("o totalizador soma o DIA inteiro, nao a pagina", async () => {
    // 10,00 (sem caixa) + 20,00 (com caixa) = 30,00. A venda de outro dia (99,00) fica de fora.
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/vendas?empresaId=${idsTeste.empresaA}&page=1&pageSize=1`,
      headers: { cookie: cookieOperador }
    });
    assertOk(resposta);
    const corpo = json<{ data: unknown[]; meta: { totalLiquido: number; pagination: { total: number } } }>(resposta);
    expect(corpo.data).toHaveLength(1);
    expect(corpo.meta.pagination.total).toBe(2);
    expect(corpo.meta.totalLiquido).toBe(30);
  });

  it("NAO ve entrada de outro dia", async () => {
    const ids = (await entradas(cookieOperador)).map((venda) => venda.id);
    expect(ids).not.toContain(idsTeste.vendaSemCaixaOutroDia);
  });

  it("quem NAO tem a flag (gestao) segue sem escopo de dia — enxerga o historico", async () => {
    const ids = (await entradas(cookieAdmin)).map((venda) => venda.id);
    expect(ids).toContain(idsTeste.vendaSemCaixaOutroDia);
    expect(ids).toContain(idsTeste.vendaSemCaixaDoDia);
  });

  it("a listagem e paginada de verdade pelo servidor", async () => {
    // Antes a tela nunca passava de 10: a chamada ia sem page/pageSize, a API devolvia o default de
    // 10 e o front paginava em memoria por cima desses 10.
    const primeiraPagina = await contexto.app.inject({
      method: "GET",
      url: `/api/vendas?empresaId=${idsTeste.empresaA}&page=1&pageSize=1`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(primeiraPagina);
    const corpo = json<{ data: unknown[]; meta: { pagination: { total: number; pageSize: number } } }>(primeiraPagina);
    expect(corpo.data).toHaveLength(1);
    // O total conta o filtro INTEIRO, nao a pagina — e o que faz o controle de pagina ter para onde ir.
    expect(corpo.meta.pagination.total).toBeGreaterThan(1);
    expect(corpo.meta.pagination.pageSize).toBe(1);
  });
});
