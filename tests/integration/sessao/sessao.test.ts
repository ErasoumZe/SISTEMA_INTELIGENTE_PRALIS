import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk, assertProblem } from "../../setup/asserts.js";
import { cookieMalformado, cookieSessao, expirarSessoesDoPerfil } from "../../setup/auth.js";
import { executarSql } from "../../setup/integracao.js";
import { usuariosTeste } from "../../setup/contexto.js";

describe("sessao integration", () => {
  let contexto: ContextoApiTeste;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("Deve_Retornar401_Quando_ConsultarMeSemSessao", async () => {
    const resposta = await contexto.app.inject({ method: "GET", url: "/api/me" });

    assertProblem(resposta, 401, "UNAUTHENTICATED");
  });

  it("Deve_RetornarSessaoComPerfil_Quando_ConsultarMeAutenticado", async () => {
    const cookie = await cookieSessao(contexto.app, "gerente");

    const resposta = await contexto.app.inject({ method: "GET", url: "/api/me", headers: { cookie } });

    assertOk(resposta);
    expect(resposta.json()).toMatchObject({
      ok: true,
      data: {
        user: { email: usuariosTeste.gerente.email },
        perfil: { email: usuariosTeste.gerente.email },
        empresas: expect.arrayContaining([expect.objectContaining({ nome: "Padaria Integracao A" })])
      }
    });
  });

  it("Deve_Retornar401_Quando_ConsultarSessaoComCookieMalformado", async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: "/api/sessao",
      headers: { cookie: cookieMalformado() }
    });

    assertProblem(resposta, 401, "UNAUTHENTICATED");
  });

  it("Deve_Retornar401_Quando_SessaoEstiverExpirada", async () => {
    const cookie = await cookieSessao(contexto.app, "gerente");
    await expirarSessoesDoPerfil("gerente");

    const resposta = await contexto.app.inject({ method: "GET", url: "/api/sessao", headers: { cookie } });

    assertProblem(resposta, 401, "UNAUTHENTICATED");
  });

  it("Deve_Retornar403_Quando_UsuarioNaoTiverPerfilConfigurado", async () => {
    const cookie = await cookieSessao(contexto.app, "semPermissao");
    await executarSql(`delete from perfis_usuarios where email = $1`, [usuariosTeste.semPermissao.email]);

    const resposta = await contexto.app.inject({ method: "GET", url: "/api/sessao", headers: { cookie } });

    assertProblem(resposta, 403, "PROFILE_NOT_CONFIGURED");
  });
});
