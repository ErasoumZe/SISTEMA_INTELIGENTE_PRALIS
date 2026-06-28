import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { criarPerfil, requisitar, usuarioId } from "./_helpers.js";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  buscarPerfilUsuario: vi.fn()
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

describe("sessao", () => {
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
    mocks.buscarPerfilUsuario.mockResolvedValue(criarPerfil(["entradas"]));
  });

  it("Deve_Retornar401_Quando_ConsultarMeSemSessao", async () => {
    // Arrange
    mocks.getSession.mockResolvedValueOnce(null);

    // Act
    const resposta = await app.inject({ method: "GET", url: "/api/me" });

    // Assert
    expect(resposta.statusCode).toBe(401);
    expect(resposta.json()).toEqual({ error: "Unauthorized" });
  });

  it("Deve_RetornarSessaoComPerfil_Quando_ConsultarMeAutenticado", async () => {
    // Arrange / Act
    const resposta = await requisitar(app, { method: "GET", url: "/api/me" });

    // Assert
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({
      user: { id: usuarioId },
      perfil: { usuarioId, permissoes: ["entradas"] }
    });
  });

  it("Deve_Retornar401_Quando_ConsultarSessaoSemSessao", async () => {
    // Arrange
    mocks.getSession.mockResolvedValueOnce(null);

    // Act
    const resposta = await app.inject({ method: "GET", url: "/api/sessao" });

    // Assert
    expect(resposta.statusCode).toBe(401);
    expect(resposta.json()).toEqual({ erro: "Nao autenticado" });
  });

  it("Deve_Retornar403_Quando_ConsultarSessaoSemPerfilConfigurado", async () => {
    // Arrange
    mocks.buscarPerfilUsuario.mockResolvedValueOnce(null);

    // Act
    const resposta = await requisitar(app, { method: "GET", url: "/api/sessao" });

    // Assert
    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toEqual({ erro: "Perfil de usuario nao configurado" });
  });

  it("Deve_RetornarPerfil_Quando_ConsultarSessaoAutenticado", async () => {
    // Arrange / Act
    const resposta = await requisitar(app, { method: "GET", url: "/api/sessao" });

    // Assert
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({ perfil: { usuarioId } });
  });
});
