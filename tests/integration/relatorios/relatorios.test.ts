import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk, assertProblem } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql, json } from "../../setup/integracao.js";

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

  // R-236 · achado A: o PDV 1-3 (sem Entradas, R-238) ve o produto e a quantidade, sem o valor (somado, ele dava as
  // vendas do turno). O caixa consultado precisa ser da empresa e de quem pergunta.
  it("Deve_OcultarValorPorProduto_Quando_OperadorSemEntradas", async () => {
    const usuario = await consultarUm<{ id: string }>('select id from "user" where lower(email) = lower($1)', [
      usuariosTeste.caixa.email
    ]);
    // Igual ao cargo Caixa do PDV 1-3: tem o relatorio de produtos e nao tem Entradas.
    await executarSql(
      `update permissoes_usuarios set regras = (regras - 'entradas_visualizar') || '{"relatorio_produtos_visualizar": true}'::jsonb where usuario_id = $1`,
      [usuario!.id]
    );
    try {
      const cookie = await cookieSessao(contexto.app, "caixa");
      const resposta = await contexto.app.inject({
        method: "GET",
        url: `/api/vendas/produtos-mais-vendidos?empresaId=${idsTeste.empresaA}`,
        headers: { cookie }
      });
      assertOk(resposta);
      const linhas = json<{ data: Array<Record<string, unknown>> }>(resposta).data;
      expect(linhas.length).toBeGreaterThan(0);
      for (const linha of linhas) {
        expect(linha).toHaveProperty("quantidade");
        expect(linha).not.toHaveProperty("valorTotal");
      }

      const caixaQueNaoExiste = await contexto.app.inject({
        method: "GET",
        url: `/api/vendas/produtos-mais-vendidos?empresaId=${idsTeste.empresaA}&caixaId=11111111-1111-4111-8111-999999999999`,
        headers: { cookie }
      });
      expect(caixaQueNaoExiste.statusCode).toBe(404);
    } finally {
      await executarSql(
        `update permissoes_usuarios set regras = (regras - 'relatorio_produtos_visualizar') || '{"entradas_visualizar": true}'::jsonb where usuario_id = $1`,
        [usuario!.id]
      );
    }
  });
});
