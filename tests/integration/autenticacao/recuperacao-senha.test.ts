import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { emailsCapturados } from "../../../api/src/auth/email.js";
import { executarSql } from "../../setup/integracao.js";

// B-02 (CX-M03A) · Recuperacao de senha: o percurso do LINK ate a nova senha.
//
// O fluxo ja existia (467f081). O que faltava era prova: o teste antigo pulava do
// `request-password-reset` direto para o `reset-password`, lendo o token do outbox. Ele NUNCA abria
// o link que o usuario de fato clica — `GET /api/auth/reset-password/:token` —, que e exatamente
// onde mora a queixa "o link volta para o login": essa rota valida `callbackURL` contra
// `trustedOrigins` e so entao redireciona para o front com o token na query.
//
// Aqui o percurso e o real: solicitar -> ler o link do e-mail -> ABRIR o link -> seguir o redirect
// -> definir a senha -> entrar com a nova -> ser recusado com a antiga.
//
// Orcamento de requisicoes: `/api/auth/*` tem rate limit de 20/min (auth.controller.ts). Este
// arquivo faz 16. Os casos de seguranca ficam em recuperacao-senha-seguranca.test.ts, que sobe a
// propria instancia e por isso tem contador proprio.

const WEB_ORIGIN = "http://127.0.0.1:5174";

describe("B-02 · recuperacao de senha, do link ate a nova senha", () => {
  let contexto: ContextoApiTeste;
  const email = "b02.recuperacao@padaria.local";
  const senhaInicial = "SenhaInicial#2026";

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    const cadastro = await contexto.app.inject({
      method: "POST",
      url: "/api/auth/sign-up/email",
      payload: { name: "Usuario B02", email, password: senhaInicial }
    });
    expect(cadastro.statusCode, cadastro.body).toBe(200);
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  beforeEach(() => {
    emailsCapturados.length = 0;
  });

  function definirSenha(token: string, novaSenha: string) {
    return contexto.app.inject({
      method: "POST",
      url: "/api/auth/reset-password",
      payload: { newPassword: novaSenha, token }
    });
  }

  function entrar(senha: string) {
    return contexto.app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      payload: { email, password: senha }
    });
  }

  // Abre o link exatamente como o navegador do usuario abriria: a URL crua que veio no e-mail.
  async function abrirLinkDoEmail(url: string) {
    const alvo = new URL(url);
    return contexto.app.inject({ method: "GET", url: `${alvo.pathname}${alvo.search}` });
  }

  async function solicitarLink() {
    const resposta = await contexto.app.inject({
      method: "POST",
      url: "/api/auth/request-password-reset",
      payload: { email, redirectTo: `${WEB_ORIGIN}/reset-password` }
    });
    expect(resposta.statusCode, resposta.body).toBe(200);
    const enviado = emailsCapturados.find((item) => item.para === email);
    expect(enviado?.url, "a solicitacao precisa produzir o link do e-mail").toBeTruthy();
    return enviado!;
  }

  // Percorre o caminho do usuario e devolve o token que chega ao FRONT (nao o do outbox).
  async function tokenEntregueAoFront() {
    const enviado = await solicitarLink();
    const abertura = await abrirLinkDoEmail(enviado.url!);
    const destino = String(abertura.headers["location"] ?? "");
    expect(destino, `o link deveria redirecionar: ${abertura.statusCode} ${abertura.body}`).toBeTruthy();
    return { destino, token: new URL(destino).searchParams.get("token"), tokenDoEmail: enviado.token! };
  }

  it("3 · o link do e-mail leva a rota real de redefinicao, com o token, e nao ao login", async () => {
    const enviado = await solicitarLink();
    const abertura = await abrirLinkDoEmail(enviado.url!);

    expect([302, 307], `status do link: ${abertura.statusCode} ${abertura.body}`).toContain(abertura.statusCode);
    const destino = String(abertura.headers["location"] ?? "");
    expect(destino, "o link nao pode devolver o usuario ao login").not.toContain("/login");
    expect(destino).toContain(`${WEB_ORIGIN}/reset-password`);
    // O token chega ao front pela query, que e onde reset-password.vue o le.
    expect(new URL(destino).searchParams.get("token"), "o front precisa receber o token").toBeTruthy();
    expect(new URL(destino).searchParams.get("error")).toBeNull();
  });

  it("5+8+9+10 · token valido define a senha; a nova entra e a antiga deixa de entrar", async () => {
    const { token } = await tokenEntregueAoFront();

    // A politica de senha vigente vale tambem no reset.
    const curta = await definirSenha(token!, "Abc123");
    expect(curta.statusCode, "senha fora da politica tem de ser recusada").toBe(400);

    const senhaNova = "SenhaNova#2026";
    const trocada = await definirSenha(token!, senhaNova);
    expect(trocada.statusCode, trocada.body).toBe(200);

    const comNova = await entrar(senhaNova);
    expect(comNova.statusCode, comNova.body).toBe(200);
    expect(comNova.headers["set-cookie"]).toBeTruthy();

    const comAntiga = await entrar(senhaInicial);
    expect(comAntiga.statusCode, "a senha antiga tem de parar de autenticar").toBeGreaterThanOrEqual(400);
  });

  it("6 · o token e de uso unico", async () => {
    const { token } = await tokenEntregueAoFront();

    expect((await definirSenha(token!, "PrimeiroUso#2026")).statusCode).toBe(200);

    const reuso = await definirSenha(token!, "SegundoUso#2026");
    expect(reuso.statusCode, "reusar o token tem de falhar").toBeGreaterThanOrEqual(400);
    expect(reuso.body, "a resposta de erro nao pode ecoar o token").not.toContain(token!);
  });

  it("7 · token expirado nao entrega token ao front e e recusado com mensagem segura", async () => {
    const enviado = await solicitarLink();
    const tokenDoEmail = enviado.token!;

    // Envelhece a verificacao no banco em vez de esperar a hora de expiracao.
    await executarSql(`update verification set "expiresAt" = now() - interval '1 hour' where identifier = $1`, [
      `reset-password:${tokenDoEmail}`
    ]);

    const abertura = await abrirLinkDoEmail(enviado.url!);
    const destino = String(abertura.headers["location"] ?? "");
    expect(new URL(destino).searchParams.get("token"), "link expirado nao pode entregar token").toBeNull();
    expect(new URL(destino).searchParams.get("error")).toBe("INVALID_TOKEN");

    const recusa = await definirSenha(tokenDoEmail, "OutraSenha#2026");
    expect(recusa.statusCode).toBeGreaterThanOrEqual(400);
    expect(recusa.body).not.toContain(tokenDoEmail);
    expect(recusa.body.toLowerCase()).not.toContain("stack");
  });
});
