import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";

// Erro de PROTOCOLO do Fastify (corpo JSON vazio ou malformado, content-type nao suportado) ja
// chega ao handler com o statusCode 4xx correto. Antes, so o 429 do rate-limit era respeitado e
// todo o resto virava 500 "Erro interno": o cliente errava e a tela acusava falha do SERVIDOR,
// alem de sujar a captura de erros com o que nao e bug.
//
// Medido no fluxo do dia de 31/07: `PUT /api/notificacoes/:id/verificar` com content-type JSON e
// sem corpo devolvia 500. E o mesmo sintoma de "Erro interno" que o Jose ve na tela.
describe("erro de protocolo responde 4xx, nao 500", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
  }, 120_000);

  afterAll(async () => contexto.fechar());

  it("Deve_Responder400_Quando_CorpoJsonVazio", async () => {
    const resposta = await contexto.app.inject({
      method: "PUT",
      url: `/api/notificacoes/${idsTeste.empresaA}/verificar?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieAdmin, "content-type": "application/json" },
      payload: ""
    });
    expect(resposta.statusCode, resposta.body).toBe(400);
    expect(resposta.body).toContain("FST_ERR_CTP_EMPTY_JSON_BODY");
    expect(resposta.body).not.toContain("INTERNAL_ERROR");
  });

  it("Deve_Responder400_Quando_CorpoJsonMalformado", async () => {
    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/transferencias",
      headers: { cookie: cookieAdmin, "content-type": "application/json" },
      payload: "{isso nao e json"
    });
    expect(resposta.statusCode, resposta.body).toBe(400);
    expect(resposta.body).not.toContain("INTERNAL_ERROR");
  });
});
