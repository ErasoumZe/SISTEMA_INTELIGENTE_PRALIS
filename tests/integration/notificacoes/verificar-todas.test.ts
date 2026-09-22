import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarTodos, consultarUm, executarSql, json } from "../../setup/integracao.js";

describe("notificacoes - verificar todas", () => {
  let contexto: ContextoApiTeste;
  let cookieTesouraria: string;
  let usuarioTesourariaId: string;
  let usuarioCaixaId: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieTesouraria = await cookieSessao(contexto.app, "tesouraria");
    const [tesouraria, caixa] = await Promise.all([
      consultarUm<{ id: string }>('select id from "user" where lower(email) = lower($1)', [
        usuariosTeste.tesouraria.email
      ]),
      consultarUm<{ id: string }>('select id from "user" where lower(email) = lower($1)', [usuariosTeste.caixa.email])
    ]);
    if (!tesouraria || !caixa) throw new Error("Usuarios de notificacao nao encontrados");
    usuarioTesourariaId = tesouraria.id;
    usuarioCaixaId = caixa.id;
  }, 120_000);

  afterAll(async () => contexto?.fechar());

  it("marca somente as pendencias abertas do destinatario na empresa ativa", async () => {
    const referencias = [randomUUID(), randomUUID(), randomUUID()];
    await executarSql(
      `insert into notificacoes (empresa_id, tipo, destinatario_usuario_id, referencia_id, titulo)
       values
         ($1, 'quebra_caixa', $2, $3, 'Pendencia da Tesouraria 1'),
         ($1, 'quebra_caixa', $2, $4, 'Pendencia da Tesouraria 2'),
         ($1, 'quebra_caixa', $5, $6, 'Pendencia do Caixa')`,
      [idsTeste.empresaA, usuarioTesourariaId, referencias[0], referencias[1], usuarioCaixaId, referencias[2]]
    );

    const resposta = await contexto.app.inject({
      method: "PUT",
      url: `/api/notificacoes/verificar-todas?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieTesouraria },
      payload: {}
    });

    expect(resposta.statusCode, resposta.body).toBe(200);
    expect(json<{ data: { total: number } }>(resposta).data.total).toBe(2);

    const estados = await consultarTodos<{ referencia_id: string; verificado: boolean; verificado_por: string | null }>(
      "select referencia_id, verificado, verificado_por from notificacoes where referencia_id = any($1::uuid[]) order by referencia_id",
      [referencias]
    );
    expect(estados).toHaveLength(3);
    expect(estados.filter((item) => item.verificado)).toHaveLength(2);
    expect(estados.filter((item) => item.verificado)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ referencia_id: referencias[0], verificado_por: usuarioTesourariaId }),
        expect.objectContaining({ referencia_id: referencias[1], verificado_por: usuarioTesourariaId })
      ])
    );
    expect(estados).toContainEqual(
      expect.objectContaining({ referencia_id: referencias[2], verificado: false, verificado_por: null })
    );
  });

  it("recusa marcar notificacoes de uma empresa fora do perfil", async () => {
    const resposta = await contexto.app.inject({
      method: "PUT",
      url: `/api/notificacoes/verificar-todas?empresaId=${idsTeste.empresaB}`,
      headers: { cookie: cookieTesouraria },
      payload: {}
    });

    expect(resposta.statusCode, resposta.body).toBe(403);
  });
});
