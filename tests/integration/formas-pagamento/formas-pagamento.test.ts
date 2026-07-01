import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarUm, json } from "../../setup/integracao.js";

describe("formas de pagamento integration", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("Deve_CriarListarEAtualizarFormaPagamento_Quando_EmpresaPermitida", async () => {
    const criado = await contexto.app.inject({
      method: "POST",
      url: "/api/formas-pagamento",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "Pix Integracao" }
    });
    expect(criado.statusCode).toBe(201);
    const formaId = json<{ data: { id: string } }>(criado).data.id;

    const listar = await contexto.app.inject({
      method: "GET",
      url: `/api/formas_pagamento?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(listar);
    expect(JSON.stringify(listar.json())).toContain("Pix Integracao");

    const editado = await contexto.app.inject({
      method: "PUT",
      url: `/api/formas-pagamento/${formaId}`,
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "Pix editado por integracao" }
    });
    expect(editado.statusCode).toBe(204);
    await expect(consultarUm("select id from formas_pagamento where id = $1 and nome = $2", [formaId, "Pix editado por integracao"])).resolves.toBeTruthy();
  });
});
