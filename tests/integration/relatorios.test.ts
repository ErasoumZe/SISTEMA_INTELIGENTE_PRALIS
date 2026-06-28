import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { criarPerfil, empresaA, empresaB, requisitar, usuarioId } from "./_helpers.js";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  buscarPerfilUsuario: vi.fn(),
  obterProdutosMaisVendidos: vi.fn()
}));

vi.mock("../../api/src/auth.js", () => ({
  auth: {
    api: {
      getSession: mocks.getSession,
      handler: vi.fn()
    }
  }
}));

vi.mock("../../api/src/perfis.js", () => ({
  buscarPerfilUsuario: mocks.buscarPerfilUsuario
}));

vi.mock("../../api/src/relatorios/produtos.service.js", () => ({
  obterProdutosMaisVendidos: mocks.obterProdutosMaisVendidos
}));

describe("relatorios", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const { buildApp } = await import("../../api/src/app.js");
    app = await buildApp();
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: usuarioId } });
    mocks.buscarPerfilUsuario.mockResolvedValue(
      criarPerfil(["relatorio_produtos_mais_vendidos"], { empresaIds: [empresaA] })
    );
    mocks.obterProdutosMaisVendidos.mockResolvedValue([{ produtoId: "p-1", nome: "Pao", quantidade: 10 }]);
  });

  it("Deve_Retornar403_Quando_ConsultarProdutosMaisVendidosSemPermissao", async () => {
    // Arrange
    mocks.buscarPerfilUsuario.mockResolvedValueOnce(criarPerfil([], { empresaIds: [empresaA] }));

    // Act
    const resposta = await requisitar(app, {
      method: "GET",
      url: `/api/relatorios/produtos-mais-vendidos?empresaId=${empresaA}`
    });

    // Assert
    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toEqual({
      erro: "Permissao insuficiente",
      permissao: "relatorio_produtos_mais_vendidos"
    });
    expect(mocks.obterProdutosMaisVendidos).not.toHaveBeenCalled();
  });

  it("Deve_RetornarProdutosMaisVendidos_Quando_EmpresaPermitida", async () => {
    // Arrange / Act
    const resposta = await requisitar(app, {
      method: "GET",
      url: `/api/relatorios/produtos-mais-vendidos?empresaId=${empresaA}`
    });

    // Assert
    expect(resposta.statusCode).toBe(200);
    expect(mocks.obterProdutosMaisVendidos).toHaveBeenCalledWith(empresaA);
  });

  it("Deve_Retornar403_Quando_ConsultarProdutosMaisVendidosDeEmpresaNaoPermitida", async () => {
    // Arrange / Act
    const resposta = await requisitar(app, {
      method: "GET",
      url: `/api/relatorios/produtos-mais-vendidos?empresaId=${empresaB}`
    });

    // Assert
    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toEqual({ erro: "Empresa nao permitida" });
    expect(mocks.obterProdutosMaisVendidos).not.toHaveBeenCalled();
  });
});
