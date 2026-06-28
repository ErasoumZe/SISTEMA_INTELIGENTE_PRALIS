import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { criarPerfil, empresaA, empresaB, payloadMovimentacao, requisitar, usuarioId } from "./_helpers.js";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  buscarPerfilUsuario: vi.fn(),
  listarMovimentacoes: vi.fn(),
  criarMovimentacao: vi.fn()
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

vi.mock("../../api/src/movimentacao/movimentacao.service.js", async () => {
  const actual = await vi.importActual<typeof import("../../api/src/movimentacao/movimentacao.service.js")>(
    "../../api/src/movimentacao/movimentacao.service.js"
  );
  return {
    ...actual,
    listarMovimentacoes: mocks.listarMovimentacoes,
    criarMovimentacao: mocks.criarMovimentacao
  };
});

describe("movimentacoes", () => {
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
    mocks.buscarPerfilUsuario.mockResolvedValue(criarPerfil(["entradas", "despesas"], { empresaIds: [empresaA] }));
    mocks.listarMovimentacoes.mockResolvedValue([{ id: "mov-1", empresaId: empresaA, tipo: "entrada" }]);
    mocks.criarMovimentacao.mockResolvedValue({ id: "mov-1", computar: true });
  });

  it("Deve_Retornar401_Quando_ListarMovimentacoesSemSessao", async () => {
    // Arrange
    mocks.getSession.mockResolvedValueOnce(null);

    // Act
    const resposta = await app.inject({ method: "GET", url: "/api/movimentacoes" });

    // Assert
    expect(resposta.statusCode).toBe(401);
    expect(mocks.listarMovimentacoes).not.toHaveBeenCalled();
  });

  it("Deve_ListarMovimentacoesDasEmpresasPermitidas_Quando_NaoInformarEmpresa", async () => {
    // Arrange / Act
    const resposta = await requisitar(app, { method: "GET", url: "/api/movimentacoes?tipo=entrada" });

    // Assert
    expect(resposta.statusCode).toBe(200);
    expect(mocks.listarMovimentacoes).toHaveBeenCalledWith({ tipo: "entrada" }, [empresaA]);
  });

  it("Deve_ListarMovimentacoesDaEmpresaAtiva_Quando_EmpresaPermitida", async () => {
    // Arrange / Act
    const resposta = await requisitar(app, { method: "GET", url: `/api/movimentacoes?empresaId=${empresaA}` });

    // Assert
    expect(resposta.statusCode).toBe(200);
    expect(mocks.listarMovimentacoes).toHaveBeenCalledWith({ empresaId: empresaA }, [empresaA]);
  });

  it("Deve_Retornar403_Quando_ListarMovimentacoesDeEmpresaNaoPermitida", async () => {
    // Arrange / Act
    const resposta = await requisitar(app, { method: "GET", url: `/api/movimentacoes?empresaId=${empresaB}` });

    // Assert
    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toEqual({ erro: "Empresa nao permitida" });
    expect(mocks.listarMovimentacoes).not.toHaveBeenCalled();
  });

  it("Deve_CriarMovimentacao_Quando_EmpresaPermitidaEPayloadValido", async () => {
    // Arrange
    const payload = payloadMovimentacao();

    // Act
    const resposta = await requisitar(app, { method: "POST", url: "/api/movimentacoes", payload });

    // Assert
    expect(resposta.statusCode).toBe(201);
    expect(resposta.json()).toEqual({ id: "mov-1", computar: true });
    expect(mocks.criarMovimentacao).toHaveBeenCalledWith(
      expect.objectContaining(payload),
      expect.objectContaining({ usuarioId })
    );
  });

  it("Deve_Retornar403_Quando_CriarMovimentacaoDeEmpresaNaoPermitida", async () => {
    // Arrange / Act
    const resposta = await requisitar(app, {
      method: "POST",
      url: "/api/movimentacoes",
      payload: payloadMovimentacao(empresaB)
    });

    // Assert
    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toEqual({ erro: "Empresa nao permitida" });
    expect(mocks.criarMovimentacao).not.toHaveBeenCalled();
  });

  it("Deve_Retornar400_Quando_CriarMovimentacaoComPayloadInvalido", async () => {
    // Arrange
    const payload = { ...payloadMovimentacao(), descricao: "" };

    // Act
    const resposta = await requisitar(app, { method: "POST", url: "/api/movimentacoes", payload });

    // Assert
    expect(resposta.statusCode).toBe(400);
    expect(mocks.criarMovimentacao).not.toHaveBeenCalled();
  });

  it("Deve_Retornar403_Quando_ServiceIndicarPermissaoInsuficiente", async () => {
    // Arrange
    const { PermissaoMovimentacaoInsuficienteError } = await import(
      "../../api/src/movimentacao/movimentacao.service.js"
    );
    mocks.criarMovimentacao.mockRejectedValueOnce(new PermissaoMovimentacaoInsuficienteError("despesas"));

    // Act
    const resposta = await requisitar(app, { method: "POST", url: "/api/movimentacoes", payload: payloadMovimentacao() });

    // Assert
    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toEqual({ erro: "Permissao insuficiente", permissao: "despesas" });
  });

  it("Deve_Retornar400_Quando_ServiceRejeitarRegraDeNegocio", async () => {
    // Arrange
    mocks.criarMovimentacao.mockRejectedValueOnce(new Error("Conta de origem obrigatoria"));

    // Act
    const resposta = await requisitar(app, { method: "POST", url: "/api/movimentacoes", payload: payloadMovimentacao() });

    // Assert
    expect(resposta.statusCode).toBe(400);
    expect(resposta.json()).toEqual({ erro: "Conta de origem obrigatoria" });
  });
});
