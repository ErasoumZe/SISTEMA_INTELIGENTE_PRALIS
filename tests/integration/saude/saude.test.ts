import { APP_NAME } from "@padaria/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk } from "../../setup/asserts.js";

describe("saude integration", () => {
  let contexto: ContextoApiTeste;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("Deve_RetornarStatusDaApi_Quando_ConsultarHealth", async () => {
    const resposta = await contexto.app.inject({ method: "GET", url: "/health" });

    assertOk(resposta);
    expect(resposta.json()).toEqual({
      ok: true,
      data: {
        status: "ok",
        service: "api",
        app: APP_NAME
      }
    });
  });
});

