import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";

// Origin do front no ambiente de teste (= WEB_ORIGIN em tests/setup/ambiente.ts).
const ORIGIN = "http://127.0.0.1:5174";

// Regressao do QA de 15/07: aprovar/recusar NF-e e discriminar lancamentos usam PATCH. Como front e
// API ficam em subdominios diferentes (sistema. -> api-sistema.), o navegador faz preflight OPTIONS.
// Sem PATCH na lista de metodos do CORS, o preflight barra a chamada com net::ERR_FAILED.
describe("cors: preflight libera os metodos usados pelo front", () => {
  let contexto: ContextoApiTeste;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it.each(["PATCH", "POST", "PUT", "DELETE"] as const)("preflight OPTIONS libera %s", async (metodo) => {
    const resposta = await contexto.app.inject({
      method: "OPTIONS",
      url: "/api/mercadorias/00000000-0000-4000-8000-000000000000/aprovar",
      headers: {
        origin: ORIGIN,
        "access-control-request-method": metodo,
        "access-control-request-headers": "content-type"
      }
    });

    expect([200, 204]).toContain(resposta.statusCode);
    expect(String(resposta.headers["access-control-allow-methods"] ?? "")).toContain(metodo);
    expect(resposta.headers["access-control-allow-origin"]).toBe(ORIGIN);
  });
});
