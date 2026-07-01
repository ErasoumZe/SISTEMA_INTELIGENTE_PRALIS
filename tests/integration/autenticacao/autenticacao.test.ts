import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieInvalido, cookieSessao } from "../../setup/auth.js";
import { assertProblem } from "../../setup/asserts.js";
import { usuariosTeste } from "../../setup/contexto.js";

describe("autenticacao integration", () => {
  let contexto: ContextoApiTeste;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("Deve_AutenticarUsuario_Quando_CredenciaisForemValidas", async () => {
    const usuario = usuariosTeste.admin;

    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      payload: { email: usuario.email, password: usuario.senha }
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.headers["set-cookie"]).toBeTruthy();
    expect(JSON.stringify(resposta.json())).toContain(usuario.email);
  });

  it("Deve_RetornarSessaoDaApi_Quando_CookieForValido", async () => {
    const cookie = await cookieSessao(contexto.app, "admin");

    const resposta = await contexto.app.inject({ method: "GET", url: "/api/me", headers: { cookie } });

    expect(resposta.statusCode).toBe(200);
    expect(JSON.stringify(resposta.json())).toContain(usuariosTeste.admin.email);
  });

  it("Deve_Retornar401_Quando_AcessarRotaProtegidaComCookieInvalido", async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: "/api/sessao",
      headers: { cookie: cookieInvalido() }
    });

    assertProblem(resposta, 401, "UNAUTHENTICATED");
  });

  it("Deve_NaoAutenticar_Quando_SenhaForIncorreta", async () => {
    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      payload: { email: usuariosTeste.admin.email, password: "senha-incorreta" }
    });

    expect(resposta.statusCode).toBeGreaterThanOrEqual(400);
  });

  it("Deve_InvalidarSessao_Quando_SignOutForChamado", async () => {
    const cookie = await cookieSessao(contexto.app, "admin");

    const resposta = await contexto.app.inject({ method: "POST", url: "/api/auth/sign-out", headers: { cookie } });

    expect([200, 204]).toContain(resposta.statusCode);
  });
});

