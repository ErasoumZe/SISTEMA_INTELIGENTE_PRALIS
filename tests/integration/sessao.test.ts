import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { criarPerfil, requisitar, usuarioId } from "./_helpers.js";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  buscarPerfilUsuario: vi.fn(),
  listarEmpresas: vi.fn()
}));

vi.mock("../../api/src/auth/config.js", () => ({
  auth: {
    api: {
      getSession: mocks.getSession,
      handler: vi.fn()
    }
  }
}));

vi.mock("../../api/src/auth/perfil.service.js", () => ({
  buscarPerfilUsuario: mocks.buscarPerfilUsuario
}));

vi.mock("../../api/src/empresas/empresas.service.js", () => ({
  listarEmpresas: mocks.listarEmpresas
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
    mocks.buscarPerfilUsuario.mockResolvedValue(criarPerfil(["entradas_criar"]));
    mocks.listarEmpresas.mockResolvedValue([]);
  });

  it("Deve_Retornar401_Quando_ConsultarMeSemSessao", async () => {
    // Arrange
    mocks.getSession.mockResolvedValueOnce(null);

    // Act
    const resposta = await app.inject({ method: "GET", url: "/api/me" });

    // Assert
    expect(resposta.statusCode).toBe(401);
    expect(resposta.json()).toMatchObject({ title: "Nao autenticado", status: resposta.statusCode });
  });

  it("Deve_RetornarSessaoComPerfil_Quando_ConsultarMeAutenticado", async () => {
    // Arrange / Act
    const resposta = await requisitar(app, { method: "GET", url: "/api/me" });

    // Assert
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({
      ok: true,
      data: {
        user: { id: usuarioId },
        perfil: { usuarioId, permissoes: ["entradas_criar"] }
      }
    });
  });

  it("Deve_Retornar401_Quando_ConsultarSessaoSemSessao", async () => {
    // Arrange
    mocks.getSession.mockResolvedValueOnce(null);

    // Act
    const resposta = await app.inject({ method: "GET", url: "/api/sessao" });

    // Assert
    expect(resposta.statusCode).toBe(401);
    expect(resposta.json()).toMatchObject({ title: "Nao autenticado", status: resposta.statusCode });
  });

  it("Deve_Retornar403_Quando_ConsultarSessaoSemPerfilConfigurado", async () => {
    // Arrange
    mocks.buscarPerfilUsuario.mockResolvedValueOnce(null);

    // Act
    const resposta = await requisitar(app, { method: "GET", url: "/api/sessao" });

    // Assert
    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toMatchObject({ title: "Perfil de usuario nao configurado", status: resposta.statusCode });
  });

  it("Deve_RetornarPerfil_Quando_ConsultarSessaoAutenticado", async () => {
    // Arrange / Act
    const resposta = await requisitar(app, { method: "GET", url: "/api/sessao" });

    // Assert
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({ ok: true, data: { perfil: { usuarioId } } });
  });
});




