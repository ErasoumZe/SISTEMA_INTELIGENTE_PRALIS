import { APP_NAME } from "@padaria/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk, assertProblem } from "../../setup/asserts.js";
import { pool } from "../../../api/src/banco/conexao.js";
import { bancoResponde } from "../../../api/src/saude/saude.service.js";

describe("saude integration", () => {
  let contexto: ContextoApiTeste;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("Deve_RetornarStatusDaApi_Quando_ConsultarHealth", async () => {
    const resposta = await contexto.app.inject({ method: "GET", url: "/health" });

    assertOk(resposta);
    expect(resposta.json()).toEqual({
      ok: true,
      data: {
        status: "ok",
        service: "api",
        app: APP_NAME,
        // G-04: prova, no corpo, que o `SELECT 1` rodou. Era este endpoint que devolvia um objeto
        // estatico e deixava o container verde com o Postgres morto (D-21).
        banco: "ok"
      }
    });
  });

  // O 200 acima so significa alguma coisa se a consulta for MESMO ao Postgres do Testcontainers.
  // Aqui a funcao que o health usa roda contra o banco real da suite, sem injecao nenhuma.
  it("Deve_ConsultarOBancoDeVerdade_Quando_HealthVerificaDependencia", async () => {
    await expect(bancoResponde()).resolves.toBe(true);
  });

  // Banco fora do ar. Nao da para derrubar o container do Testcontainers — a suite inteira depende
  // dele —, entao o driver e que passa a recusar: e o que o `pg` faz quando o Postgres cai.
  //
  // O ramo "pendurou" (host que engole pacotes, o caso que exige o tempo limite) esta em
  // `tests/unit/saude-banco`. O efeito ponta a ponta (503 -> container unhealthy) foi verificado no
  // Compose de desenvolvimento com `docker stop` no Postgres, como pede o aceite da G-04.
  it("Deve_Responder503_Quando_BancoNaoResponde", async () => {
    const consultaOriginal = pool.query.bind(pool);
    // Substituicao pontual do driver, desfeita no finally.
    pool.query = () => Promise.reject(new Error("banco fora do ar (simulado)"));

    try {
      const resposta = await contexto.app.inject({ method: "GET", url: "/health" });

      // 503 e nao 500: "estou de pe, mas sem a minha dependencia". E o que faz `r.ok` virar falso
      // no healthcheck do Compose e o `verificarApi()` do agente CREARE abortar o ciclo.
      assertProblem(resposta, 503, "DATABASE_UNAVAILABLE");
      expect(resposta.json()).toMatchObject({ details: { service: "api", banco: "indisponivel" } });
    } finally {
      pool.query = consultaOriginal;
    }
  });

  // Sem isto, um teste que deixasse o pool quebrado envenenaria os proximos arquivos da suite.
  it("Deve_VoltarASaudavel_Quando_OBancoResponderDeNovo", async () => {
    const resposta = await contexto.app.inject({ method: "GET", url: "/health" });
    assertOk(resposta);
  });
});
