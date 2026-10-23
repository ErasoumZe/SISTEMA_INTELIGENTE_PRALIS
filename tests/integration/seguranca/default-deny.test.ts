import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ok } from "@padaria/shared/api";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk, assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";

const RAIZ = join(import.meta.dirname, "..", "..", "..");

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

  it("Deve_TravarOConteudoDaAllowlist_Quando_AlguemAbrirRotaNova", () => {
    // Ate a V3 nenhum teste enumerava a allowlist: abrir uma rota ao publico passava em SILENCIO.
    // Falha fechada protege contra esquecer de abrir; nada protegia contra abrir demais. Esta lista
    // existe para que qualquer acrescimo vire um diff que alguem precisa aprovar.
    const fonte = readFileSync(join(RAIZ, "api", "src", "app.ts"), "utf8");
    const bloco = fonte.slice(
      fonte.indexOf("const rotasComAutenticacaoPropria"),
      fonte.indexOf("]);", fonte.indexOf("const rotasComAutenticacaoPropria"))
    );
    const rotas = [...bloco.matchAll(/"([^"]+)"/gu)].map((achado) => achado[1]).sort();
    expect(rotas).toEqual([
      "/api/admissao/dependentes",
      "/api/admissao/dependentes/:id",
      "/api/admissao/ficha",
      "/api/admissao/ficha/enviar",
      "/api/auth/*",
      "/api/integracoes",
      "/api/integracoes/conciliacao",
      "/api/me",
      "/api/rodada",
      "/api/rodada/aceitar",
      // Doc 57 §5 e §5.1: o fornecedor devolve a separacao e marca o que vende, pelo mesmo token do convite.
      "/api/rodada/produtos",
      "/api/rodada/responder",
      "/api/rodada/separacao",
      "/api/sessao",
      "/health"
    ]);
  });

  it("Deve_ResponderPreflightCors_Quando_SemSessao", async () => {
    const resposta = await contexto.app.inject({
      method: "OPTIONS",
      url: "/api/vendas",
      headers: {
        origin: "http://127.0.0.1:5174",
        "access-control-request-method": "POST"
      }
    });
    expect(resposta.statusCode).toBeLessThan(400);
  });
});
