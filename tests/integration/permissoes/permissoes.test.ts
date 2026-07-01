import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";

describe("permissoes integration", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("Deve_CriarListarAtualizarEExcluirRegraDePermissao", async () => {
    const criado = await contexto.app.inject({
      method: "POST",
      url: "/api/permissoes",
      headers: { cookie: cookieAdmin },
      payload: { tipoPermissao: "cargo", cargoId: idsTeste.cargoGerente, regras: { cadastro_contas_visualizar: true } }
    });
    expect(criado.statusCode).toBe(201);

    const regras = await contexto.app.inject({
      method: "GET",
      url: `/api/permissoes/regras?empresaId=${idsTeste.empresaA}&tipoPermissao=cargo&alvoId=${idsTeste.cargoGerente}`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(regras);
    expect(JSON.stringify(regras.json())).toContain("cadastro_contas_visualizar");

    const editado = await contexto.app.inject({
      method: "PUT",
      url: `/api/permissoes/${idsTeste.cargoGerente}`,
      headers: { cookie: cookieAdmin },
      payload: { tipoPermissao: "cargo", cargoId: idsTeste.cargoGerente, regras: { cadastro_contas_visualizar: false } }
    });
    expect(editado.statusCode).toBe(204);

    const excluido = await contexto.app.inject({
      method: "DELETE",
      url: `/api/permissoes/regras?empresaId=${idsTeste.empresaA}&tipoPermissao=cargo&alvoId=${idsTeste.cargoGerente}&permissao=cadastro_contas_visualizar`,
      headers: { cookie: cookieAdmin }
    });
    expect(excluido.statusCode).toBe(204);
  });
});
