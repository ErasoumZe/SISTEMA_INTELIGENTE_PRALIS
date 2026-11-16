import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarTodos, consultarUm, executarSql, json } from "../../setup/integracao.js";

// Auditoria de PDVs (Marco, 13-16/11/2026): vendas da CREARE x caixas, por filtros. Cenario num dia proprio
// (10/03/2026) no pdvLivre: um caixa da manha (07:00-11:00) com uma venda dentro e uma venda da CREARE as 12:00,
// depois do caixa fechar, que tem que virar alerta.
const DIA = "2026-03-10";

type Consulta = {
  resumo: { vendas: number; total: number; vendasFora: number; valorFora: number };
  dias: Array<{
    data: string;
    status: string;
    gerada: { em: string; automatica: boolean } | null;
    pdvs: Array<{
      pdvId: string | null;
      status: string;
      vendas: number;
      total: number;
      caixas: Array<{ caixaId: string; turno: string | null; vendas: number; total: number }>;
      fora: Array<{ valor: number; produtos: Array<{ descricao: string }> }>;
    }>;
  }>;
  pdvs: Array<{ id: string; nome: string }>;
};

describe("Auditoria de PDVs - vendas da CREARE x caixas", () => {
  let contexto: ContextoApiTeste;
  let cookieTesouraria = "";
  let cookieSemPermissao = "";
  let cookieCaixa = "";
  const caixaManha = randomUUID();

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    [cookieTesouraria, cookieSemPermissao, cookieCaixa] = await Promise.all([
      cookieSessao(contexto.app, "tesouraria"),
      cookieSessao(contexto.app, "semPermissao"),
      cookieSessao(contexto.app, "caixa")
    ]);

    await executarSql(
      `insert into fechamentos_caixa (
         id, empresa_id, pdv_id, usuario_id, usuario_caixa_id, colaborador_id, turno_caixa,
         data_movimento, data_hora_abertura, aberto_em, data_hora_fechamento, fechado_em,
         token_edicao, status, criado_por
       )
       select $1, empresa_id, $2, usuario_id, usuario_caixa_id, colaborador_id, 'manha',
              $3::date, '2026-03-10T10:00:00Z', '2026-03-10T10:00:00Z', '2026-03-10T14:00:00Z', '2026-03-10T14:00:00Z',
              $4, 'fechado', criado_por
         from fechamentos_caixa
        where id = $5`,
      [caixaManha, idsTeste.pdvLivre, DIA, `TOKEN-AUDITORIA-${caixaManha}`, idsTeste.caixaFechado]
    );
    const chave = await consultarUm<{ id: string }>(
      "insert into integracoes_chaves (empresa_id, tipo, codigo, ativa) values ($1, 'vendas', $2, true) returning id",
      [idsTeste.empresaA, `TESTE-AUDITORIA-${caixaManha}`]
    );
    const venda = (externo: string, caixaId: string | null, quando: string, valor: string, integrada = true) =>
      consultarUm<{ id: string }>(
        `insert into vendas (empresa_id, pdv_id, caixa_id, identificador_externo, descricao, data_referencia, data_venda,
                             valor_original, status, computar, integracao_chave_id)
         values ($1, $2, $3, $4, 'Venda auditoria', $5::date, $6, $7, 'aprovado', true, $8) returning id`,
        [idsTeste.empresaA, idsTeste.pdvLivre, caixaId, externo, DIA, quando, valor, integrada ? chave?.id : null]
      );
    // 08:30 (Brasilia) dentro do caixa da manha.
    await venda(`CREARE:AUD-1-${caixaManha}`, caixaManha, "2026-03-10T11:30:00Z", "20.00");
    // 12:00 (Brasilia), caixa ja fechado: fora de caixa.
    const fora = await venda(`CREARE:AUD-2-${caixaManha}`, null, "2026-03-10T15:00:00Z", "12.50");
    await executarSql(
      "insert into vendas_produtos (venda_id, descricao_produto, quantidade) values ($1, 'Pao de queijo', 2)",
      [fora?.id]
    );
    // Venda manual (sem integracao) nao entra na auditoria.
    await venda(`MANUAL-AUD-${caixaManha}`, null, "2026-03-10T16:00:00Z", "99.00", false);
  });

  afterAll(async () => contexto.fechar());

  const consultar = (filtros: Record<string, string> = {}, cookie = cookieTesouraria) =>
    contexto.app.inject({
      method: "GET",
      url: `/api/auditoria-pdv/consulta?${new URLSearchParams({
        empresaId: idsTeste.empresaA,
        inicio: DIA,
        fim: DIA,
        pdvId: idsTeste.pdvLivre,
        ...filtros
      }).toString()}`,
      headers: { cookie }
    });

  const dados = async (filtros: Record<string, string> = {}) => {
    const resposta = await consultar(filtros);
    expect(resposta.statusCode, resposta.body).toBe(200);
    return json<{ data: Consulta }>(resposta).data;
  };

  it("recusa quem nao tem o acesso do Relatorio de fechamento (operador e sem permissao)", async () => {
    assertProblem(await consultar({}, cookieSemPermissao), 403);
    assertProblem(await consultar({}, cookieCaixa), 403);
    const gerar = await contexto.app.inject({
      method: "POST",
      url: "/api/auditoria-pdv/gerar",
      headers: { cookie: cookieCaixa },
      payload: { empresaId: idsTeste.empresaA, data: DIA }
    });
    assertProblem(gerar, 403);
    const agenda = await contexto.app.inject({
      method: "PUT",
      url: "/api/auditoria-pdv/agenda",
      headers: { cookie: cookieSemPermissao },
      payload: { empresaId: idsTeste.empresaA, ativa: true, horario: "22:00" }
    });
    assertProblem(agenda, 403);
  });

  it("nao deixa consultar empresa de fora do usuario", async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/auditoria-pdv/consulta?empresaId=${idsTeste.empresaB}&inicio=${DIA}&fim=${DIA}`,
      headers: { cookie: cookieTesouraria }
    });
    assertProblem(resposta, 403);
  });

  it("cruza o dia: venda no caixa da manha bate, venda da CREARE sem caixa vira alerta com produtos", async () => {
    const consulta = await dados();
    expect(consulta.resumo).toEqual({ vendas: 2, total: 32.5, vendasFora: 1, valorFora: 12.5 });
    expect(consulta.dias).toHaveLength(1);
    const [pdv] = consulta.dias[0]!.pdvs;
    expect(consulta.dias[0]!.status).toBe("alerta");
    expect(pdv).toMatchObject({ pdvId: idsTeste.pdvLivre, status: "alerta", vendas: 2, total: 32.5 });
    expect(pdv!.caixas).toEqual([expect.objectContaining({ caixaId: caixaManha, turno: "manha", vendas: 1, total: 20 })]);
    expect(pdv!.fora).toHaveLength(1);
    expect(pdv!.fora[0]).toMatchObject({ valor: 12.5, produtos: [expect.objectContaining({ descricao: "Pao de queijo" })] });
    expect(consulta.pdvs.some((p) => p.id === idsTeste.pdvLivre)).toBe(true);
  });

  it("filtra por turno, faixa de hora e situacao", async () => {
    expect((await dados({ turno: "tarde" })).dias).toEqual([]);
    expect((await dados({ turno: "manha" })).resumo).toEqual({ vendas: 1, total: 20, vendasFora: 0, valorFora: 0 });

    const meioDia = await dados({ horaInicio: "11:30", horaFim: "13:00" });
    expect(meioDia.resumo).toEqual({ vendas: 1, total: 12.5, vendasFora: 1, valorFora: 12.5 });

    expect((await dados({ status: "ok" })).dias).toEqual([]);
    expect((await dados({ status: "alerta" })).dias).toHaveLength(1);
    // Campo vazio do formulario vale como "sem filtro".
    expect((await dados({ turno: "", horaInicio: "" })).resumo.vendas).toBe(2);
  });

  it("valida o periodo: fim antes do inicio e mais de 31 dias", async () => {
    expect((await consultar({ inicio: "2026-03-11", fim: DIA })).statusCode).toBe(400);
    expect((await consultar({ inicio: "2026-02-01", fim: DIA })).statusCode).toBe(400);
    expect((await consultar({ horaInicio: "14:00", horaFim: "10:00" })).statusCode).toBe(400);
  });

  it("gerar grava a auditoria do dia, avisa a Tesouraria no sino e gerar de novo nao duplica", async () => {
    const gerar = () =>
      contexto.app.inject({
        method: "POST",
        url: "/api/auditoria-pdv/gerar",
        headers: { cookie: cookieTesouraria },
        payload: { empresaId: idsTeste.empresaA, data: DIA }
      });
    const primeira = await gerar();
    expect(primeira.statusCode, primeira.body).toBe(200);
    const dia = json<{ data: { vendasFora: number; gerada: { automatica: boolean } } }>(primeira).data;
    expect(dia.vendasFora).toBeGreaterThanOrEqual(1);
    expect(dia.gerada.automatica).toBe(false);

    const segunda = await gerar();
    expect(segunda.statusCode, segunda.body).toBe(200);

    const auditorias = await consultarTodos<{ id: string; vendas_fora: number }>(
      "select id, vendas_fora from auditorias_pdv where empresa_id = $1 and data = $2",
      [idsTeste.empresaA, DIA]
    );
    expect(auditorias).toHaveLength(1);
    const avisos = await consultarTodos<{ destinatario_usuario_id: string; titulo: string }>(
      "select destinatario_usuario_id, titulo from notificacoes where tipo = 'auditoria_pdv' and referencia_id = $1",
      [auditorias[0]!.id]
    );
    expect(avisos.length).toBeGreaterThanOrEqual(1);
    expect(new Set(avisos.map((a) => a.destinatario_usuario_id)).size).toBe(avisos.length);
    expect(avisos[0]!.titulo).toContain("10/03");

    const consulta = await dados();
    expect(consulta.dias[0]!.gerada).toMatchObject({ automatica: false });
  });

  it("agenda do automatico: comeca desligada, salva e devolve o horario", async () => {
    const ler = () =>
      contexto.app.inject({
        method: "GET",
        url: `/api/auditoria-pdv/agenda?empresaId=${idsTeste.empresaA}`,
        headers: { cookie: cookieTesouraria }
      });
    const antes = await ler();
    expect(antes.statusCode, antes.body).toBe(200);
    expect(json<{ data: unknown }>(antes).data).toEqual({ ativa: false, horario: "23:30" });

    const horarioInvalido = await contexto.app.inject({
      method: "PUT",
      url: "/api/auditoria-pdv/agenda",
      headers: { cookie: cookieTesouraria },
      payload: { empresaId: idsTeste.empresaA, ativa: true, horario: "25:00" }
    });
    expect(horarioInvalido.statusCode).toBe(400);

    const salvar = await contexto.app.inject({
      method: "PUT",
      url: "/api/auditoria-pdv/agenda",
      headers: { cookie: cookieTesouraria },
      payload: { empresaId: idsTeste.empresaA, ativa: true, horario: "22:15" }
    });
    expect(salvar.statusCode, salvar.body).toBe(200);
    expect(json<{ data: unknown }>(await ler()).data).toEqual({ ativa: true, horario: "22:15" });
  });
});
