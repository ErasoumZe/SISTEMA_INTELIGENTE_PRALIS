import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { emailsCapturados } from "../../../api/src/auth/email.js";

// B-02 (CX-M03A) · Lado de SEGURANCA da recuperacao de senha: enumeracao de conta, vazamento do
// token e recusa segura de token invalido.
//
// Arquivo separado de proposito: `/api/auth/*` tem rate limit de 20/min (auth.controller.ts) e cada
// arquivo de teste sobe a propria instancia da API, logo com contador proprio. Juntar tudo num
// arquivo so fazia os ultimos casos receberem 429 e falharem por motivo errado.

const WEB_ORIGIN = "http://127.0.0.1:5174";

describe("B-02 · seguranca da recuperacao de senha", () => {
  let contexto: ContextoApiTeste;
  const email = "b02.seguranca@padaria.local";
  const inexistente = "b02.nao.existe@padaria.local";

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    const cadastro = await contexto.app.inject({
      method: "POST",
      url: "/api/auth/sign-up/email",
      payload: { name: "Usuario B02 seguranca", email, password: "SenhaInicial#2026" }
    });
    expect(cadastro.statusCode, cadastro.body).toBe(200);
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  beforeEach(() => {
    emailsCapturados.length = 0;
  });

  function solicitar(alvo: string) {
    return contexto.app.inject({
      method: "POST",
      url: "/api/auth/request-password-reset",
      payload: { email: alvo, redirectTo: `${WEB_ORIGIN}/reset-password` }
    });
  }

  it("1+2 · a resposta e identica para e-mail existente e inexistente (sem enumeracao)", async () => {
    const existente = await solicitar(email);
    const ausente = await solicitar(inexistente);

    expect(existente.statusCode).toBe(200);
    expect(ausente.statusCode, "status diferente ja denuncia se a conta existe").toBe(existente.statusCode);
    expect(ausente.body, "corpo diferente ja denuncia se a conta existe").toBe(existente.body);
    expect(existente.body.toLowerCase()).not.toContain("not found");
    expect(existente.body.toLowerCase()).not.toContain("nao encontrado");

    // A diferenca fica onde deve ficar: so o e-mail existente gera mensagem, e isso nao vaza na resposta.
    expect(emailsCapturados.filter((item) => item.para === email)).toHaveLength(1);
    expect(emailsCapturados.filter((item) => item.para === inexistente)).toHaveLength(0);
  });

  it("7b · token inventado redireciona como invalido e nao permite trocar a senha", async () => {
    const inventado = "token-que-nunca-existiu-b02";
    const abertura = await contexto.app.inject({
      method: "GET",
      url: `/api/auth/reset-password/${inventado}?callbackURL=${encodeURIComponent(`${WEB_ORIGIN}/reset-password`)}`
    });
    const destino = String(abertura.headers["location"] ?? "");
    expect(destino, `esperado redirect, veio ${abertura.statusCode}`).toBeTruthy();
    expect(new URL(destino).searchParams.get("error")).toBe("INVALID_TOKEN");
    expect(new URL(destino).searchParams.get("token")).toBeNull();

    const recusa = await contexto.app.inject({
      method: "POST",
      url: "/api/auth/reset-password",
      payload: { newPassword: "QualquerSenha#2026", token: inventado }
    });
    expect(recusa.statusCode).toBeGreaterThanOrEqual(400);
    expect(recusa.body.toLowerCase()).not.toContain("stack");
  });

  it("4 · o token de recuperacao nao vai para o log", async () => {
    const registrado: string[] = [];
    const originais = { info: console.info, log: console.log, warn: console.warn };
    console.info = (...partes: unknown[]) => registrado.push(partes.join(" "));
    console.log = (...partes: unknown[]) => registrado.push(partes.join(" "));
    console.warn = (...partes: unknown[]) => registrado.push(partes.join(" "));
    try {
      expect((await solicitar(email)).statusCode).toBe(200);
    } finally {
      console.info = originais.info;
      console.log = originais.log;
      console.warn = originais.warn;
    }

    const enviado = emailsCapturados.find((item) => item.para === email);
    expect(enviado?.token, "a solicitacao precisa ter gerado o token").toBeTruthy();

    const tudo = registrado.join("\n");
    expect(tudo, "o token nao pode ir para o log").not.toContain(enviado!.token!);
    // A URL carrega o token no proprio caminho: logar a URL vaza o token do mesmo jeito.
    expect(tudo, "a url com o token embutido nao pode ir para o log").not.toContain(enviado!.url!);
  });
});
