import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk, assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { json } from "../../setup/integracao.js";

type IndisponibilidadeJson = {
  data: {
    id: string;
    motivos: string[];
    motivoOutro: string | null;
    iniciadoEm: string;
  };
};

describe("indisponibilidade do computador do PDV", () => {
  let contexto: ContextoApiTeste;
  let cookieCaixa: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieCaixa = await cookieSessao(contexto.app, "caixa");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("registra a parada, a expõe no status e registra o retorno", async () => {
    const registrar = await contexto.app.inject({
      method: "POST",
      url: `/api/caixa/${idsTeste.caixaAberto}/indisponibilidades`,
      headers: { cookie: cookieCaixa },
      payload: { motivos: ["internet_caiu", "computador_travou"], motivoOutro: null }
    });

    assertOk(registrar);
    expect(json<IndisponibilidadeJson>(registrar).data).toMatchObject({
      motivos: ["internet_caiu", "computador_travou"],
      motivoOutro: null
    });

    const status = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/status?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieCaixa }
    });
    assertOk(status);
    expect(status.json()).toMatchObject({
      data: { indisponibilidadeAberta: { motivos: ["internet_caiu", "computador_travou"] } }
    });

    const duplicado = await contexto.app.inject({
      method: "POST",
      url: `/api/caixa/${idsTeste.caixaAberto}/indisponibilidades`,
      headers: { cookie: cookieCaixa },
      payload: { motivos: ["falta_energia"], motivoOutro: null }
    });
    assertProblem(duplicado, 400);

    const retorno = await contexto.app.inject({
      method: "POST",
      url: `/api/caixa/${idsTeste.caixaAberto}/indisponibilidades/retornar`,
      headers: { cookie: cookieCaixa },
      payload: {}
    });
    assertOk(retorno);
    expect(json<{ data: { retornadoEm: string } }>(retorno).data.retornadoEm).toBeTruthy();

    const statusAposRetorno = await contexto.app.inject({
      method: "GET",
      url: `/api/caixa/status?empresaId=${idsTeste.empresaA}`,
      headers: { cookie: cookieCaixa }
    });
    assertOk(statusAposRetorno);
    expect(statusAposRetorno.json()).toMatchObject({ data: { indisponibilidadeAberta: null } });
  });
});
