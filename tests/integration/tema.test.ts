import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { criarPerfil, empresaA, empresaB, payloadTema, requisitar, usuarioId } from "./_helpers.js";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  buscarPerfilUsuario: vi.fn(),
  carregarTema: vi.fn(),
  atualizarTema: vi.fn()
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

vi.mock("../../api/src/tema/tema.service.js", () => ({
  carregarTema: mocks.carregarTema,
  atualizarTema: mocks.atualizarTema
}));

describe("tema", () => {
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
    mocks.buscarPerfilUsuario.mockResolvedValue(criarPerfil(["configurar_tema"], { empresaIds: [empresaA] }));
    mocks.carregarTema.mockResolvedValue({ corPrimaria: "#005f73" });
    mocks.atualizarTema.mockResolvedValue({ corPrimaria: "#005f73" });
  });

  it("Deve_Retornar401_Quando_CarregarTemaSemSessao", async () => {
    // Arrange
    mocks.getSession.mockResolvedValueOnce(null);

    // Act
    const resposta = await app.inject({ method: "GET", url: `/api/tema?empresaId=${empresaA}&tela=entradas` });

    // Assert
    expect(resposta.statusCode).toBe(401);
    expect(mocks.carregarTema).not.toHaveBeenCalled();
  });

  it("Deve_CarregarTemaDaEmpresa_Quando_EmpresaPermitida", async () => {
    // Arrange / Act
    const resposta = await requisitar(app, { method: "GET", url: `/api/tema?empresaId=${empresaA}&tela=entradas` });

    // Assert
    expect(resposta.statusCode).toBe(200);
    expect(mocks.carregarTema).toHaveBeenCalledWith({ empresaId: empresaA, tela: "entradas" });
  });

  it("Deve_Retornar403_Quando_CarregarTemaDeEmpresaNaoPermitida", async () => {
    // Arrange / Act
    const resposta = await requisitar(app, { method: "GET", url: `/api/tema?empresaId=${empresaB}&tela=entradas` });

    // Assert
    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toEqual({ erro: "Empresa nao permitida" });
    expect(mocks.carregarTema).not.toHaveBeenCalled();
  });

  it("Deve_Retornar400_Quando_CarregarTemaSemEmpresa", async () => {
    // Arrange / Act
    const resposta = await requisitar(app, { method: "GET", url: "/api/tema?tela=entradas" });

    // Assert
    expect(resposta.statusCode).toBe(400);
    expect(mocks.carregarTema).not.toHaveBeenCalled();
  });

  it("Deve_Retornar403_Quando_AtualizarTemaSemPermissao", async () => {
    // Arrange
    mocks.buscarPerfilUsuario.mockResolvedValueOnce(criarPerfil([], { empresaIds: [empresaA] }));

    // Act
    const resposta = await requisitar(app, { method: "PUT", url: "/api/tema", payload: payloadTema() });

    // Assert
    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toEqual({ erro: "Permissao insuficiente", permissao: "configurar_tema" });
    expect(mocks.atualizarTema).not.toHaveBeenCalled();
  });

  it("Deve_AtualizarTemaDaEmpresa_Quando_TiverPermissao", async () => {
    // Arrange
    const payload = payloadTema();

    // Act
    const resposta = await requisitar(app, { method: "PUT", url: "/api/tema", payload });

    // Assert
    expect(resposta.statusCode).toBe(200);
    expect(mocks.atualizarTema).toHaveBeenCalledWith(payload, usuarioId);
  });

  it("Deve_Retornar403_Quando_AtualizarTemaDeEmpresaNaoPermitida", async () => {
    // Arrange / Act
    const resposta = await requisitar(app, { method: "PUT", url: "/api/tema", payload: payloadTema(empresaB) });

    // Assert
    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toEqual({ erro: "Empresa nao permitida" });
    expect(mocks.atualizarTema).not.toHaveBeenCalled();
  });
});
