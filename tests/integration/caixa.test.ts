import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { colaboradorId, criarPerfil, empresaA, empresaB, requisitar, usuarioId } from "./_helpers.js";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  buscarPerfilUsuario: vi.fn(),
  obterResumoCaixa: vi.fn(),
  acertarSaldoCaixa: vi.fn(),
  obterStatusCaixa: vi.fn(),
  abrirCaixa: vi.fn(),
  editarAberturaCaixa: vi.fn(),
  acertarSaldoCaixaOperacional: vi.fn(),
  fecharCaixa: vi.fn(),
  listarHistoricoCaixa: vi.fn()
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
  acertarSaldoCaixa: mocks.acertarSaldoCaixa,
  obterStatusCaixa: mocks.obterStatusCaixa,
  abrirCaixa: mocks.abrirCaixa,
  editarAberturaCaixa: mocks.editarAberturaCaixa,
  acertarSaldoCaixaOperacional: mocks.acertarSaldoCaixaOperacional,
  fecharCaixa: mocks.fecharCaixa,
  listarHistoricoCaixa: mocks.listarHistoricoCaixa
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
    mocks.buscarPerfilUsuario.mockResolvedValue(criarPerfil(["fechamento_com_diferenca_visualizar"], { empresaIds: [empresaA] }));
    mocks.obterResumoCaixa.mockResolvedValue({
      totalEntradas: 100,
      totalTransferencias: 20,
      totalDespesas: 30,
      totalRetiradas: 10,
      saldo: 80
    });
    mocks.acertarSaldoCaixa.mockResolvedValue({ despesaId: "mov-ajuste" });
    mocks.obterStatusCaixa.mockResolvedValue({ caixaAberto: null, resumo: null });
    mocks.abrirCaixa.mockResolvedValue({ caixaAberto: { id: "66666666-6666-4666-8666-666666666666" }, resumo: null });
    mocks.editarAberturaCaixa.mockResolvedValue({ caixaAberto: { id: "66666666-6666-4666-8666-666666666666" }, resumo: null });
    mocks.acertarSaldoCaixaOperacional.mockResolvedValue({
      despesaId: "77777777-7777-4777-8777-777777777777",
      debitoId: "88888888-8888-4888-8888-888888888888",
      valorDiferenca: 10
    });
    mocks.fecharCaixa.mockResolvedValue({ caixaAberto: null, resumo: null });
    mocks.listarHistoricoCaixa.mockResolvedValue([
      { id: "66666666-6666-4666-8666-666666666666", tokenEdicao: "ABC123" }
    ]);
  });

  it("Deve_Retornar403_Quando_ConsultarStatusSemPermissaoOperarCaixa", async () => {
    // Arrange
    mocks.buscarPerfilUsuario.mockResolvedValueOnce(criarPerfil([], { empresaIds: [empresaA] }));

    // Act
    const resposta = await requisitar(app, { method: "GET", url: `/api/caixa/status?empresaId=${empresaA}` });

    // Assert
    expect(resposta.statusCode).toBe(403);
    expect(mocks.obterStatusCaixa).not.toHaveBeenCalled();
  });

  it("Deve_ConsultarStatus_Quando_UsuarioPodeOperarCaixa", async () => {
    // Arrange
    mocks.buscarPerfilUsuario.mockResolvedValueOnce(criarPerfil(["caixa_operar"], { empresaIds: [empresaA] }));

    // Act
    const resposta = await requisitar(app, { method: "GET", url: `/api/caixa/status?empresaId=${empresaA}` });

    // Assert
    expect(resposta.statusCode).toBe(200);
    expect(mocks.obterStatusCaixa).toHaveBeenCalledWith(empresaA, expect.objectContaining({ usuarioId }));
  });

  it("Deve_AbrirCaixa_Quando_PayloadValido", async () => {
    // Arrange
    mocks.buscarPerfilUsuario.mockResolvedValueOnce(criarPerfil(["caixa_operar"], { empresaIds: [empresaA] }));
    const payload = {
      empresaId: empresaA,
      pdvId: "66666666-6666-4666-8666-666666666666",
      usuarioCaixaId: usuarioId,
      dataHoraAbertura: "2026-06-28T10:00",
      observacao: "inicio"
    };

    // Act
    const resposta = await requisitar(app, { method: "POST", url: "/api/caixa/abrir", payload });

    // Assert
    expect(resposta.statusCode).toBe(201);
    expect(mocks.abrirCaixa).toHaveBeenCalledWith(payload, expect.objectContaining({ usuarioId }));
  });

  it("Deve_Retornar400_Quando_AberturaSobreporPeriodo", async () => {
    // Arrange
    mocks.buscarPerfilUsuario.mockResolvedValueOnce(criarPerfil(["caixa_operar"], { empresaIds: [empresaA] }));
    mocks.abrirCaixa.mockRejectedValueOnce(
      new Error("A data e hora de abertura ja pertence a outro caixa aberto/fechado")
    );

    // Act
    const resposta = await requisitar(app, {
      method: "POST",
      url: "/api/caixa/abrir",
      payload: {
        empresaId: empresaA,
        pdvId: "66666666-6666-4666-8666-666666666666",
        usuarioCaixaId: usuarioId,
        dataHoraAbertura: "2026-06-28T10:00"
      }
    });

    // Assert
    expect(resposta.statusCode).toBe(400);
    expect(resposta.json()).toMatchObject({ title: "A data e hora de abertura ja pertence a outro caixa aberto/fechado", status: resposta.statusCode });
  });

  it("Deve_EditarAbertura_Quando_TokenInformado", async () => {
    // Arrange
    mocks.buscarPerfilUsuario.mockResolvedValueOnce(criarPerfil(["caixa_operar"], { empresaIds: [empresaA] }));
    const caixaId = "66666666-6666-4666-8666-666666666666";
    const payload = {
      tokenEdicao: "ABC123",
      pdvId: "77777777-7777-4777-8777-777777777777",
      usuarioCaixaId: usuarioId,
      dataHoraAbertura: "2026-06-28T11:00",
      observacao: "ajuste"
    };

    // Act
    const resposta = await requisitar(app, { method: "PUT", url: `/api/caixa/${caixaId}/abertura`, payload });

    // Assert
    expect(resposta.statusCode).toBe(204);
    expect(resposta.body).toBe("");
    expect(mocks.editarAberturaCaixa).toHaveBeenCalledWith(caixaId, payload, expect.objectContaining({ usuarioId }));
  });

  it("Deve_Retornar400_Quando_TokenDeEdicaoInvalido", async () => {
    // Arrange
    mocks.buscarPerfilUsuario.mockResolvedValueOnce(criarPerfil(["caixa_operar"], { empresaIds: [empresaA] }));
    mocks.editarAberturaCaixa.mockRejectedValueOnce(new Error("Token de edicao invalido"));

    // Act
    const resposta = await requisitar(app, {
      method: "PUT",
      url: "/api/caixa/66666666-6666-4666-8666-666666666666/abertura",
      payload: {
        tokenEdicao: "ERRADO",
        pdvId: "77777777-7777-4777-8777-777777777777",
        usuarioCaixaId: usuarioId,
        dataHoraAbertura: "2026-06-28T11:00"
      }
    });

    // Assert
    expect(resposta.statusCode).toBe(400);
    expect(resposta.json()).toMatchObject({ title: "Token de edicao invalido", status: resposta.statusCode });
  });

  it("Deve_AcertarSaldoOperacional_Quando_CaixaAberto", async () => {
    // Arrange
    mocks.buscarPerfilUsuario.mockResolvedValueOnce(criarPerfil(["caixa_operar"], { empresaIds: [empresaA] }));
    const caixaId = "66666666-6666-4666-8666-666666666666";

    // Act
    const resposta = await requisitar(app, {
      method: "POST",
      url: `/api/caixa/${caixaId}/acertar-saldo`,
      payload: { observacao: "quebra" }
    });

    // Assert
    expect(resposta.statusCode).toBe(201);
    expect(mocks.acertarSaldoCaixaOperacional).toHaveBeenCalledWith(
      caixaId,
      { observacao: "quebra" },
      expect.objectContaining({ usuarioId })
    );
  });

  it("Deve_FecharCaixa_Quando_AcertoNaoPendente", async () => {
    // Arrange
    mocks.buscarPerfilUsuario.mockResolvedValueOnce(criarPerfil(["caixa_operar"], { empresaIds: [empresaA] }));
    const caixaId = "66666666-6666-4666-8666-666666666666";

    // Act
    const resposta = await requisitar(app, {
      method: "POST",
      url: `/api/caixa/${caixaId}/fechar`,
      payload: { observacao: "fim" }
    });

    // Assert
    expect(resposta.statusCode).toBe(204);
    expect(resposta.body).toBe("");
    expect(mocks.fecharCaixa).toHaveBeenCalledWith(
      caixaId,
      { observacao: "fim" },
      expect.objectContaining({ usuarioId })
    );
  });

  it("Deve_Retornar403_Quando_ConsultarHistoricoSemGerenciarCaixas", async () => {
    // Arrange
    mocks.buscarPerfilUsuario.mockResolvedValueOnce(criarPerfil(["caixa_operar"], { empresaIds: [empresaA] }));

    // Act
    const resposta = await requisitar(app, { method: "GET", url: `/api/caixa/historico?empresaId=${empresaA}` });

    // Assert
    expect(resposta.statusCode).toBe(403);
    expect(mocks.listarHistoricoCaixa).not.toHaveBeenCalled();
  });

  it("Deve_ListarHistoricoComToken_Quando_Gerente", async () => {
    // Arrange
    mocks.buscarPerfilUsuario.mockResolvedValueOnce(criarPerfil(["caixas_gerenciar"], { empresaIds: [empresaA] }));

    // Act
    const resposta = await requisitar(app, { method: "GET", url: `/api/caixa/historico?empresaId=${empresaA}` });

    // Assert
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({
      ok: true,
      data: [{ id: "66666666-6666-4666-8666-666666666666", tokenEdicao: "ABC123" }]
    });
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
    expect(resposta.json()).toMatchObject({ title: "Empresa nao permitida", status: resposta.statusCode });
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
    expect(resposta.json()).toEqual({ ok: true, data: { id: "mov-ajuste" } });
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
    expect(resposta.json()).toMatchObject({ title: "Empresa nao permitida", status: resposta.statusCode });
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
    expect(resposta.json()).toMatchObject({ title: "Nao ha diferenca para acertar", status: resposta.statusCode });
  });
});



