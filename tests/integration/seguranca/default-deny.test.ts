import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ok } from "@padaria/shared/api";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk, assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";

describe("seguranca default-deny integration", () => {
  let contexto: ContextoApiTeste;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    // Simula o esquecimento classico: rota nova registrada SEM preHandler de permissao.
    // Com o hook global default-deny, ela precisa nascer exigindo sessao.
    contexto.app.get("/api/rota-sem-guard-teste", async () => ok({ protegido: true }));
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("Deve_Retornar401_Quando_RotaSemGuardForChamadaSemSessao", async () => {
    const resposta = await contexto.app.inject({ method: "GET", url: "/api/rota-sem-guard-teste" });
    assertProblem(resposta, 401);
  });

  it("Deve_Liberar_Quando_RotaSemGuardForChamadaComSessao", async () => {
    const cookie = await cookieSessao(contexto.app, "semPermissao");
    const resposta = await contexto.app.inject({
      method: "GET",
      url: "/api/rota-sem-guard-teste",
      headers: { cookie }
    });
    assertOk(resposta);
    expect(resposta.json()).toMatchObject({ data: { protegido: true } });
  });

  it("Deve_ManterAllowlistPublica_Quando_SemSessao", async () => {
    const saude = await contexto.app.inject({ method: "GET", url: "/health" });
    expect(saude.statusCode).toBe(200);
    const me = await contexto.app.inject({ method: "GET", url: "/api/me" });
    expect(me.statusCode).toBe(401);
  });

  it("Deve_ResponderPreflightCors_Quando_SemSessao", async () => {
    const resposta = await contexto.app.inject({
      method: "OPTIONS",
      url: "/api/vendas",
      headers: {
        origin: "http://localhost:5174",
        "access-control-request-method": "POST"
      }
    });
    expect(resposta.statusCode).toBeLessThan(400);
  });
});
