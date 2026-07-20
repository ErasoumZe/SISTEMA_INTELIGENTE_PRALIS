import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../setup/aplicacao.js";

// Regressao do BUG: o @fastify/rate-limit lanca um erro com statusCode 429 (e ja setou o header
// Retry-After no reply). O error handler global convertia isso em 500 INTERNAL_ERROR, fazendo o
// cliente re-martelar. Agora deve sair como 429 com Retry-After preservado. A rota /api/auth/* tem
// limite baixo (20/min), entao da para estourar rapido sem depender das rotas de integracao.
describe("rate limit -> 429 (nao 500)", () => {
  let contexto: ContextoApiTeste;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("Deve_Retornar429ComRetryAfter_Quando_ExcederOLimiteDaRota", async () => {
    let excedida: Awaited<ReturnType<typeof contexto.app.inject>> | undefined;
    for (let i = 0; i < 30; i += 1) {
      const resposta = await contexto.app.inject({ method: "GET", url: "/api/auth/get-session" });
      if (resposta.statusCode === 429) {
        excedida = resposta;
        break;
      }
    }

    expect(excedida, "esperava uma resposta 429 apos exceder o limite").toBeDefined();
    expect(excedida!.statusCode).toBe(429); // e NAO 500
    expect(excedida!.headers["retry-after"]).toBeDefined(); // header preservado
    const corpo = JSON.parse(excedida!.body) as { status: number; code: string };
    expect(corpo.code).toBe("RATE_LIMITED");
    expect(corpo.status).toBe(429);
  });
});
