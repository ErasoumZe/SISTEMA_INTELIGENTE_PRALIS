import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { emailsCapturados } from "../../../api/src/auth/email.js";

async function cookieDeLogin(app: FastifyInstance, email: string, senha: string) {
  const resposta = await app.inject({
    method: "POST",
    url: "/api/auth/sign-in/email",
    payload: { email, password: senha }
  });
  expect(resposta.statusCode).toBe(200);
  const cookies = resposta.headers["set-cookie"];
  const lista = Array.isArray(cookies) ? cookies : cookies ? [cookies] : [];
  return lista.map((cookie) => cookie.split(";")[0]).join("; ");
}

describe("reset de senha e verificacao integration", () => {
  let contexto: ContextoApiTeste;
  const email = "reset-teste@padaria.local";
  const senhaInicial = "SenhaInicial123";

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    // Usuario proprio criado pelo cadastro publico (nao mexe nos usuarios de seed).
    await contexto.app.inject({
      method: "POST",
      url: "/api/auth/sign-up/email",
      payload: { name: "Reset Teste", email, password: senhaInicial }
    });
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  beforeEach(() => {
    emailsCapturados.length = 0;
  });

  it("Deve_EnviarEmailDeVerificacao_Quando_Solicitado", async () => {
    const cookie = await cookieDeLogin(contexto.app, email, senhaInicial);

    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/auth/send-verification-email",
      headers: { cookie },
      payload: { email, callbackURL: "http://localhost:5174/login" }
    });

    expect(resposta.statusCode).toBe(200);
    const enviado = emailsCapturados.find((item) => item.para === email);
    expect(enviado).toBeTruthy();
    expect(enviado?.token).toBeTruthy();
  });

  it("Deve_RedefinirSenhaEPermitirLogin_Quando_TokenValido", async () => {
    const solicitacao = await contexto.app.inject({
      method: "POST",
      url: "/api/auth/request-password-reset",
      payload: { email, redirectTo: "http://localhost:5174/reset-password" }
    });
    expect(solicitacao.statusCode).toBe(200);

    const enviado = emailsCapturados.find((item) => item.para === email);
    const token = enviado?.token;
    expect(token).toBeTruthy();

    const novaSenha = "NovaSenha456";
    const reset = await contexto.app.inject({
      method: "POST",
      url: "/api/auth/reset-password",
      payload: { newPassword: novaSenha, token }
    });
    expect(reset.statusCode).toBe(200);

    const login = await contexto.app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      payload: { email, password: novaSenha }
    });
    expect(login.statusCode).toBe(200);
    expect(login.headers["set-cookie"]).toBeTruthy();
  });
});
