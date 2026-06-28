import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { colaboradorId, criarPerfil, empresaA, empresaB, requisitar, usuarioId } from "./_helpers.js";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  buscarPerfilUsuario: vi.fn(),
  obterResumoCaixa: vi.fn(),
  acertarSaldoCaixa: vi.fn()
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

vi.mock("../../api/src/caixa/caixa.service.js", () => ({
  obterResumoCaixa: mocks.obterResumoCaixa,
  acertarSaldoCaixa: mocks.acertarSaldoCaixa
}));

describe("caixa", () => {
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
    mocks.buscarPerfilUsuario.mockResolvedValue(criarPerfil(["fechamento_com_diferenca"], { empresaIds: [empresaA] }));
    mocks.obterResumoCaixa.mockResolvedValue({
      totalEntradas: 100,
      totalTransferencias: 20,
      totalDespesas: 30,
      totalRetiradas: 10,
      saldo: 80
    });
    mocks.acertarSaldoCaixa.mockResolvedValue({ movimentacaoId: "mov-ajuste" });
  });

  it("Deve_Retornar403_Quando_ConsultarResumoSemPermissao", async () => {
    // Arrange
    mocks.buscarPerfilUsuario.mockResolvedValueOnce(criarPerfil([], { empresaIds: [empresaA] }));

    // Act
    const resposta = await requisitar(app, {
      method: "GET",
      url: `/api/fechamento-caixa/resumo?empresaId=${empresaA}&data=2026-06-28`
    });

    // Assert
    expect(resposta.statusCode).toBe(403);
    expect(mocks.obterResumoCaixa).not.toHaveBeenCalled();
  });

  it("Deve_ConsultarResumo_Quando_EmpresaPermitida", async () => {
    // Arrange / Act
    const resposta = await requisitar(app, {
      method: "GET",
      url: `/api/fechamento-caixa/resumo?empresaId=${empresaA}&data=2026-06-28`
    });

    // Assert
    expect(resposta.statusCode).toBe(200);
    expect(mocks.obterResumoCaixa).toHaveBeenCalledWith({ empresaId: empresaA, data: "2026-06-28" });
  });

  it("Deve_Retornar403_Quando_ConsultarResumoDeEmpresaNaoPermitida", async () => {
    // Arrange / Act
    const resposta = await requisitar(app, {
      method: "GET",
      url: `/api/fechamento-caixa/resumo?empresaId=${empresaB}&data=2026-06-28`
    });

    // Assert
    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toEqual({ erro: "Empresa nao permitida" });
    expect(mocks.obterResumoCaixa).not.toHaveBeenCalled();
  });

  it("Deve_AcertarSaldo_Quando_EmpresaPermitida", async () => {
    // Arrange
    const payload = {
      empresaId: empresaA,
      colaboradorId,
      data: "2026-06-28",
      valorDiferenca: 10
    };

    // Act
    const resposta = await requisitar(app, { method: "POST", url: "/api/fechamento-caixa/acertar-saldo", payload });

    // Assert
    expect(resposta.statusCode).toBe(201);
    expect(resposta.json()).toEqual({ movimentacaoId: "mov-ajuste" });
    expect(mocks.acertarSaldoCaixa).toHaveBeenCalledWith(payload, usuarioId);
  });

  it("Deve_Retornar403_Quando_AcertarSaldoDeEmpresaNaoPermitida", async () => {
    // Arrange
    const payload = {
      empresaId: empresaB,
      colaboradorId,
      data: "2026-06-28",
      valorDiferenca: 10
    };

    // Act
    const resposta = await requisitar(app, { method: "POST", url: "/api/fechamento-caixa/acertar-saldo", payload });

    // Assert
    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toEqual({ erro: "Empresa nao permitida" });
    expect(mocks.acertarSaldoCaixa).not.toHaveBeenCalled();
  });

  it("Deve_Retornar400_Quando_ServiceRejeitarAcerto", async () => {
    // Arrange
    mocks.acertarSaldoCaixa.mockRejectedValueOnce(new Error("Nao ha diferenca para acertar"));

    // Act
    const resposta = await requisitar(app, {
      method: "POST",
      url: "/api/fechamento-caixa/acertar-saldo",
      payload: { empresaId: empresaA, colaboradorId, data: "2026-06-28", valorDiferenca: 0 }
    });

    // Assert
    expect(resposta.statusCode).toBe(400);
    expect(resposta.json()).toEqual({ erro: "Nao ha diferenca para acertar" });
  });
});
