import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk, assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";

describe("relatorios integration", () => {
  let contexto: ContextoApiTeste;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("Deve_RetornarProdutosMaisVendidos_Quando_ExistemVendasSeedadas", async () => {
    const cookie = await cookieSessao(contexto.app, "admin");

    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/vendas/produtos-mais-vendidos?empresaId=${idsTeste.empresaA}`,
      headers: { cookie }
    });

    assertOk(resposta);
    const corpo = JSON.stringify(resposta.json());
    expect(corpo).toContain("Produto Integracao");
    expect(corpo).toContain("42");
  });

  it("Deve_Retornar403_Quando_RelatorioForDeEmpresaNaoPermitida", async () => {
    const cookie = await cookieSessao(contexto.app, "admin");

    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/vendas/produtos-mais-vendidos?empresaId=${idsTeste.empresaB}`,
      headers: { cookie }
    });

    assertProblem(resposta, 403, "FORBIDDEN_COMPANY");
  });
});
