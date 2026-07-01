import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk, assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarUm, json } from "../../setup/integracao.js";

describe("clientes integration", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("Deve_CriarListarEAtualizarCliente_Quando_EmpresaPermitida", async () => {
    const criado = await contexto.app.inject({
      method: "POST",
      url: "/api/clientes",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        nome: "Cliente criado por integracao",
        documento: "123.456.789-01",
        email: "cliente.integracao@padaria.local"
      }
    });
    expect(criado.statusCode).toBe(201);
    const clienteId = json<{ data: { id: string } }>(criado).data.id;

    const listar = await contexto.app.inject({
      method: "GET",
      url: `/api/clientes?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(listar);
    expect(JSON.stringify(listar.json())).toContain("Cliente criado por integracao");

    const editado = await contexto.app.inject({
      method: "PUT",
      url: `/api/clientes/${clienteId}`,
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "Cliente editado por integracao", documento: "12345678901" }
    });
    expect(editado.statusCode).toBe(204);
    await expect(consultarUm("select id from clientes where id = $1 and nome = $2", [clienteId, "Cliente editado por integracao"])).resolves.toBeTruthy();
  });

  it("Deve_Retornar403_Quando_CriarClienteEmEmpresaNaoPermitida", async () => {
    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/clientes",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaB, nome: "Cliente proibido" }
    });

    assertProblem(resposta, 403, "FORBIDDEN_COMPANY");
  });
});
