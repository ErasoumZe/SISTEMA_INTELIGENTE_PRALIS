import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarTodos, executarSql, json } from "../../setup/integracao.js";

describe("Relatório de fechamento - conferência final da Tesouraria", () => {
  let contexto: ContextoApiTeste;
  let cookieTesouraria = "";
  let cookieAdmin = "";
  let cookieSemPermissao = "";
  const caixaComDivergencia = randomUUID();

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    [cookieTesouraria, cookieAdmin, cookieSemPermissao] = await Promise.all([
      cookieSessao(contexto.app, "tesouraria"),
      cookieSessao(contexto.app, "admin"),
      cookieSessao(contexto.app, "semPermissao")
    ]);

    // A divergência é um fato já registrado no fechamento. A conferência final não a cria nem
    // recalcula valores: apenas produz a decisão auditável da Tesouraria sobre esse fato.
    await executarSql(
      `insert into fechamentos_caixa (
         id, empresa_id, pdv_id, usuario_id, usuario_caixa_id, colaborador_id,
         data_movimento, data_hora_abertura, aberto_em, data_hora_fechamento, fechado_em,
         token_edicao, status, criado_por
       )
       select $1, empresa_id, pdv_id, usuario_id, usuario_caixa_id, colaborador_id,
              '2026-07-20', now(), now(), now(), now(), $2, 'fechado', criado_por
         from fechamentos_caixa
        where id = $3`,
      [caixaComDivergencia, `TOKEN-TESOURARIA-${caixaComDivergencia}`, idsTeste.caixaFechado]
    );
    await executarSql("insert into ajustes_fechamento_caixa (fechamento_caixa_id, valor_diferenca) values ($1, $2)", [
      caixaComDivergencia,
      "7.50"
    ]);
  });

  afterAll(async () => contexto.fechar());

  it("recusa o ato final para quem não tem a permissão própria", async () => {
    const resposta = await contexto.app.inject({
      method: "POST",
      url: `/api/relatorios/fechamentos/${idsTeste.caixaFechado}/conferir`,
      headers: { cookie: cookieSemPermissao },
      payload: { resultado: "conferido" }
    });

    assertProblem(resposta, 403);
  });

  it("permite ao administrador total consultar a fila de fechamento", async () => {
    const lista = await contexto.app.inject({
      method: "GET",
      url: `/api/relatorios/fechamentos?empresaId=${idsTeste.empresaA}&page=1&pageSize=10`,
      headers: { cookie: cookieAdmin }
    });
    expect(lista.statusCode, lista.body).toBe(200);
  });

  it("confirma um caixa fechado sem pendências, preserva os fatos e não duplica a decisão", async () => {
    const confirmar = await contexto.app.inject({
      method: "POST",
      url: `/api/relatorios/fechamentos/${idsTeste.caixaFechado}/conferir`,
      headers: { cookie: cookieTesouraria },
      payload: { resultado: "conferido" }
    });
    expect(confirmar.statusCode, confirmar.body).toBe(200);
    const primeiro = json<{ data: { id: string; resultado: string; observacao: string | null } }>(confirmar).data;
    expect(primeiro).toMatchObject({ resultado: "conferido", observacao: null });

    const repetir = await contexto.app.inject({
      method: "POST",
      url: `/api/relatorios/fechamentos/${idsTeste.caixaFechado}/conferir`,
      headers: { cookie: cookieTesouraria },
      payload: { resultado: "conferido" }
    });
    expect(repetir.statusCode, repetir.body).toBe(200);
    expect(json<{ data: { id: string } }>(repetir).data.id).toBe(primeiro.id);

    const dossie = await contexto.app.inject({
      method: "GET",
      url: `/api/relatorios/fechamentos/${idsTeste.caixaFechado}`,
      headers: { cookie: cookieTesouraria }
    });
    expect(dossie.statusCode, dossie.body).toBe(200);
    expect(
      json<{ data: { situacaoTesouraria: string; conferenciasTesouraria: Array<{ id: string; resultado: string }> } }>(
        dossie
      ).data
    ).toMatchObject({
      situacaoTesouraria: "conferido_tesouraria",
      conferenciasTesouraria: [{ id: primeiro.id, resultado: "conferido" }]
    });

    const eventos = await consultarTodos<{ resultado: string }>(
      "select resultado from fechamentos_caixa_conferencias_tesouraria where fechamento_caixa_id = $1",
      [idsTeste.caixaFechado]
    );
    expect(eventos).toEqual([{ resultado: "conferido" }]);
  });

  it("exige justificativa e registra uma divergência sem alterar a quebra do fechamento", async () => {
    const semMotivo = await contexto.app.inject({
      method: "POST",
      url: `/api/relatorios/fechamentos/${caixaComDivergencia}/conferir`,
      headers: { cookie: cookieTesouraria },
      payload: { resultado: "divergente" }
    });
    expect(semMotivo.statusCode).toBe(400);

    const confirmarComoOk = await contexto.app.inject({
      method: "POST",
      url: `/api/relatorios/fechamentos/${caixaComDivergencia}/conferir`,
      headers: { cookie: cookieTesouraria },
      payload: { resultado: "conferido" }
    });
    expect(confirmarComoOk.statusCode).toBe(400);

    const registrar = await contexto.app.inject({
      method: "POST",
      url: `/api/relatorios/fechamentos/${caixaComDivergencia}/conferir`,
      headers: { cookie: cookieTesouraria },
      payload: { resultado: "divergente", observacao: "Diferença de R$ 7,50 conferida na folha física." }
    });
    expect(registrar.statusCode, registrar.body).toBe(200);

    const dossie = await contexto.app.inject({
      method: "GET",
      url: `/api/relatorios/fechamentos/${caixaComDivergencia}`,
      headers: { cookie: cookieTesouraria }
    });
    expect(dossie.statusCode, dossie.body).toBe(200);
    const dados = json<{
      data: {
        situacaoTesouraria: string;
        ajuste: { valorDiferenca: number };
        conferenciasTesouraria: Array<{ resultado: string; observacao: string | null }>;
      };
    }>(dossie).data;
    expect(dados.situacaoTesouraria).toBe("divergencia_confirmada_tesouraria");
    expect(dados.ajuste.valorDiferenca).toBe(7.5);
    expect(dados.conferenciasTesouraria).toMatchObject([
      { resultado: "divergente", observacao: "Diferença de R$ 7,50 conferida na folha física." }
    ]);
  });

  it("altera o status da decisao com motivo, nos dois sentidos, sem apagar o historico", async () => {
    const conferir = (caixaId: string, payload: Record<string, unknown>) =>
      contexto.app.inject({
        method: "POST",
        url: `/api/relatorios/fechamentos/${caixaId}/conferir`,
        headers: { cookie: cookieTesouraria },
        payload
      });

    // caixaFechado ja foi CONFERIDO acima e nao tem divergencia registrada: revisar para divergente exige motivo.
    expect((await conferir(idsTeste.caixaFechado, { resultado: "divergente" })).statusCode).toBe(400);
    const paraDivergente = await conferir(idsTeste.caixaFechado, {
      resultado: "divergente",
      observacao: "Folha fisica conferida de novo: faltou um comprovante."
    });
    expect(paraDivergente.statusCode, paraDivergente.body).toBe(200);

    // E de volta para conferido: tambem exige motivo (nao e a primeira decisao).
    expect((await conferir(idsTeste.caixaFechado, { resultado: "conferido" })).statusCode).toBe(400);
    const deVolta = await conferir(idsTeste.caixaFechado, {
      resultado: "conferido",
      observacao: "Comprovante entregue e anexado."
    });
    expect(deVolta.statusCode, deVolta.body).toBe(200);

    const eventos = await consultarTodos<{ resultado: string }>(
      "select resultado from fechamentos_caixa_conferencias_tesouraria where fechamento_caixa_id = $1 order by conferido_em, id",
      [idsTeste.caixaFechado]
    );
    expect(eventos.map((evento) => evento.resultado)).toEqual(["conferido", "divergente", "conferido"]);

    const dossie = await contexto.app.inject({
      method: "GET",
      url: `/api/relatorios/fechamentos/${idsTeste.caixaFechado}`,
      headers: { cookie: cookieTesouraria }
    });
    expect(json<{ data: { situacaoTesouraria: string } }>(dossie).data.situacaoTesouraria).toBe("conferido_tesouraria");
  });

  it("Teve quebra: a Tesouraria aponta quebra num caixa sem diferenca, com motivo obrigatorio", async () => {
    const caixaLimpo = randomUUID();
    await executarSql(
      `insert into fechamentos_caixa (
         id, empresa_id, pdv_id, usuario_id, usuario_caixa_id, colaborador_id,
         data_movimento, data_hora_abertura, aberto_em, data_hora_fechamento, fechado_em,
         token_edicao, status, criado_por
       )
       select $1, empresa_id, pdv_id, usuario_id, usuario_caixa_id, colaborador_id,
              '2026-07-21', now(), now(), now(), now(), $2, 'fechado', criado_por
         from fechamentos_caixa
        where id = $3`,
      [caixaLimpo, `TOKEN-QUEBRA-${caixaLimpo}`, idsTeste.caixaFechado]
    );
    const conferir = (payload: Record<string, unknown>) =>
      contexto.app.inject({
        method: "POST",
        url: `/api/relatorios/fechamentos/${caixaLimpo}/conferir`,
        headers: { cookie: cookieTesouraria },
        payload
      });

    expect((await conferir({ resultado: "divergente" })).statusCode).toBe(400);
    const resposta = await conferir({ resultado: "divergente", observacao: "Faltou uma nota de R$ 50 na contagem." });
    expect(resposta.statusCode, resposta.body).toBe(200);

    const dossie = await contexto.app.inject({
      method: "GET",
      url: `/api/relatorios/fechamentos/${caixaLimpo}`,
      headers: { cookie: cookieTesouraria }
    });
    expect(json<{ data: { situacaoTesouraria: string } }>(dossie).data.situacaoTesouraria).toBe(
      "divergencia_confirmada_tesouraria"
    );
  });
});
