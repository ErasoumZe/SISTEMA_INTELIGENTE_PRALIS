import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { criarPerfil, empresaA, empresaB, registroId, requisitar, usuarioId } from "./_helpers.js";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  buscarPerfilUsuario: vi.fn(),
  listarMalotes: vi.fn(),
  listarLacresMalote: vi.fn(),
  validarLacre: vi.fn(),
  criarMalote: vi.fn(),
  atualizarMalote: vi.fn()
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

vi.mock("../../api/src/malotes/malotes.service.js", () => ({
  listarMalotes: mocks.listarMalotes,
  listarLacresMalote: mocks.listarLacresMalote,
  validarLacre: mocks.validarLacre,
  criarMalote: mocks.criarMalote,
  atualizarMalote: mocks.atualizarMalote,
  mensagemErroMalote: (error: Error) => error.message
}));

describe("malotes", () => {
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
      criarPerfil(["cadastro_malotes", "transferencias"], { empresaIds: [empresaA] })
    );
    mocks.listarMalotes.mockResolvedValue([{ id: registroId, empresaId: empresaA, codigo: "M-001" }]);
    mocks.listarLacresMalote.mockResolvedValue([{ id: registroId, numero: "L-001" }]);
    mocks.validarLacre.mockResolvedValue({ disponivel: true });
    mocks.criarMalote.mockResolvedValue({ id: registroId, empresaId: empresaA, codigo: "M-001", lacres: ["L-001"] });
    mocks.atualizarMalote.mockResolvedValue({ id: registroId, empresaId: empresaA, codigo: "M-002" });
  });

  it("Deve_Retornar403_Quando_ListarMalotesSemPermissao", async () => {
    // Arrange
    mocks.buscarPerfilUsuario.mockResolvedValueOnce(criarPerfil([], { empresaIds: [empresaA] }));

    // Act
    const resposta = await requisitar(app, { method: "GET", url: `/api/malotes?empresaId=${empresaA}` });

    // Assert
    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toEqual({ erro: "Permissao insuficiente", permissao: "cadastro_malotes" });
    expect(mocks.listarMalotes).not.toHaveBeenCalled();
  });

  it("Deve_ListarMalotes_Quando_TiverPermissaoDeTransferencia", async () => {
    // Arrange
    mocks.buscarPerfilUsuario.mockResolvedValueOnce(criarPerfil(["transferencias"], { empresaIds: [empresaA] }));

    // Act
    const resposta = await requisitar(app, { method: "GET", url: `/api/malotes?empresaId=${empresaA}` });

    // Assert
    expect(resposta.statusCode).toBe(200);
    expect(mocks.listarMalotes).toHaveBeenCalledWith([empresaA]);
  });

  it("Deve_ListarMalotesDaEmpresa_Quando_TiverPermissao", async () => {
    // Arrange / Act
    const resposta = await requisitar(app, { method: "GET", url: `/api/malotes?empresaId=${empresaA}` });

    // Assert
    expect(resposta.statusCode).toBe(200);
    expect(mocks.listarMalotes).toHaveBeenCalledWith([empresaA]);
  });

  it("Deve_Retornar403_Quando_ListarMalotesDeEmpresaNaoPermitida", async () => {
    // Arrange / Act
    const resposta = await requisitar(app, { method: "GET", url: `/api/malotes?empresaId=${empresaB}` });

    // Assert
    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toEqual({ erro: "Empresa nao permitida" });
    expect(mocks.listarMalotes).not.toHaveBeenCalled();
  });

  it("Deve_ListarLacresDoMalote_Quando_TiverPermissaoDeTransferencia", async () => {
    // Arrange / Act
    const resposta = await requisitar(app, { method: "GET", url: `/api/malotes/${registroId}/lacres` });

    // Assert
    expect(resposta.statusCode).toBe(200);
    expect(mocks.listarLacresMalote).toHaveBeenCalledWith(registroId, [empresaA]);
  });

  it("Deve_ValidarLacreNoEscopoDaEmpresa_Quando_EmpresaPermitida", async () => {
    // Arrange / Act
    const resposta = await requisitar(app, {
      method: "GET",
      url: `/api/lacres/validar?numero=L-001&empresaId=${empresaA}`
    });

    // Assert
    expect(resposta.statusCode).toBe(200);
    expect(mocks.validarLacre).toHaveBeenCalledWith("L-001", [empresaA]);
  });

  it("Deve_Retornar403_Quando_ValidarLacreDeEmpresaNaoPermitida", async () => {
    // Arrange / Act
    const resposta = await requisitar(app, {
      method: "GET",
      url: `/api/lacres/validar?numero=L-001&empresaId=${empresaB}`
    });

    // Assert
    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toEqual({ erro: "Empresa nao permitida" });
    expect(mocks.validarLacre).not.toHaveBeenCalled();
  });

  it("Deve_CriarMalote_Quando_LacresForemValidosEEmpresaPermitida", async () => {
    // Arrange
    const payload = { empresaId: empresaA, codigo: "M-001", lacres: ["L-001"] };

    // Act
    const resposta = await requisitar(app, { method: "POST", url: "/api/malotes", payload });

    // Assert
    expect(resposta.statusCode).toBe(200);
    expect(mocks.criarMalote).toHaveBeenCalledWith(payload, usuarioId);
  });

  it("Deve_Retornar403_Quando_CriarMaloteEmEmpresaNaoPermitida", async () => {
    // Arrange
    const payload = { empresaId: empresaB, codigo: "M-001", lacres: ["L-001"] };

    // Act
    const resposta = await requisitar(app, { method: "POST", url: "/api/malotes", payload });

    // Assert
    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toEqual({ erro: "Empresa nao permitida" });
    expect(mocks.criarMalote).not.toHaveBeenCalled();
  });

  it("Deve_Retornar400_Quando_CriarMaloteComPayloadInvalido", async () => {
    // Arrange / Act
    const resposta = await requisitar(app, {
      method: "POST",
      url: "/api/malotes",
      payload: { empresaId: empresaA, codigo: "", lacres: [] }
    });

    // Assert
    expect(resposta.statusCode).toBe(400);
    expect(mocks.criarMalote).not.toHaveBeenCalled();
  });

  it("Deve_AtualizarMaloteNoEscopoPermitido_Quando_PayloadValido", async () => {
    // Arrange
    const payload = { codigo: "M-002", lacres: ["L-002"] };

    // Act
    const resposta = await requisitar(app, { method: "PUT", url: `/api/malotes/${registroId}`, payload });

    // Assert
    expect(resposta.statusCode).toBe(200);
    expect(mocks.atualizarMalote).toHaveBeenCalledWith(registroId, payload, [empresaA]);
  });

  it("Deve_Retornar403_Quando_AtualizarMaloteForaDoEscopo", async () => {
    // Arrange
    mocks.atualizarMalote.mockRejectedValueOnce(new Error("Empresa nao permitida"));

    // Act
    const resposta = await requisitar(app, {
      method: "PUT",
      url: `/api/malotes/${registroId}`,
      payload: { codigo: "M-002", lacres: [] }
    });

    // Assert
    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toEqual({ erro: "Empresa nao permitida" });
  });
});
