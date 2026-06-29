import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { criarPerfil, empresaA, empresaB, registroId, requisitar, usuarioId } from "./_helpers.js";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  buscarPerfilUsuario: vi.fn(),
  importarCadastroEmpresa: vi.fn(),
  exportarCadastroEmpresa: vi.fn()
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

vi.mock("../../api/src/copia/copia.service.js", () => ({
  importarCadastroEmpresa: mocks.importarCadastroEmpresa,
  exportarCadastroEmpresa: mocks.exportarCadastroEmpresa
}));

describe("copia", () => {
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
      criarPerfil(
        [
          "cadastro_contas",
          "cadastro_fornecedores",
          "cadastro_colaboradores",
          "cadastro_grupos_despesas",
          "cadastro_unidades_medida",
          "cadastro_areas_setores",
          "cadastro_produtos",
          "cadastro_malotes"
        ],
        { empresaIds: [empresaA, empresaB] }
      )
    );
    mocks.importarCadastroEmpresa.mockResolvedValue({ tipo: "contas", modo: "simples", inseridos: 1 });
    mocks.exportarCadastroEmpresa.mockResolvedValue({ inseridos: 1 });
  });

  it.each([
    "/api/contas",
    "/api/fornecedores",
    "/api/colaboradores",
    "/api/cargos",
    "/api/grupos",
    "/api/unidades_medida",
    "/api/areas_setores",
    "/api/produtos",
    "/api/malotes"
  ])("Deve_ImportarCadastro_Quando_RotaDeCopiaForPermitida", async (baseUrl) => {
    // Arrange
    const payload = { empresaOrigemId: empresaA, empresaDestinoId: empresaB, modo: "simples" };

    // Act
    const resposta = await requisitar(app, { method: "POST", url: `${baseUrl}/importar`, payload });

    // Assert
    expect(resposta.statusCode).toBe(200);
    expect(mocks.importarCadastroEmpresa).toHaveBeenCalled();
  });

  it.each([
    "/api/contas",
    "/api/fornecedores",
    "/api/colaboradores",
    "/api/cargos",
    "/api/grupos",
    "/api/unidades_medida",
    "/api/areas_setores",
    "/api/produtos",
    "/api/malotes"
  ])("Deve_ExportarCadastro_Quando_RotaDeCopiaForPermitida", async (baseUrl) => {
    // Arrange
    const payload = { empresaDestinoId: empresaB, modo: "simples" };

    // Act
    const resposta = await requisitar(app, { method: "POST", url: `${baseUrl}/${registroId}/exportar`, payload });

    // Assert
    expect(resposta.statusCode).toBe(200);
    expect(mocks.exportarCadastroEmpresa).toHaveBeenCalled();
  });

  it("Deve_Retornar403_Quando_ImportarCadastroSemPermissaoDoTipo", async () => {
    // Arrange
    mocks.buscarPerfilUsuario.mockResolvedValueOnce(criarPerfil([], { empresaIds: [empresaA, empresaB] }));

    // Act
    const resposta = await requisitar(app, {
      method: "POST",
      url: "/api/contas/importar",
      payload: { empresaOrigemId: empresaA, empresaDestinoId: empresaB, modo: "simples" }
    });

    // Assert
    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toMatchObject({ title: "Permissao insuficiente", status: resposta.statusCode, details: { permissao: "cadastro_contas" } });
    expect(mocks.importarCadastroEmpresa).not.toHaveBeenCalled();
  });

  it("Deve_Retornar400_Quando_ImportarCadastroComPayloadInvalido", async () => {
    // Arrange / Act
    const resposta = await requisitar(app, {
      method: "POST",
      url: "/api/contas/importar",
      payload: { empresaOrigemId: empresaA, empresaDestinoId: empresaA, modo: "invalido" }
    });

    // Assert
    expect(resposta.statusCode).toBe(400);
    expect(mocks.importarCadastroEmpresa).not.toHaveBeenCalled();
  });

  it("Deve_Retornar403_Quando_ServiceBloquearEmpresaNaImportacao", async () => {
    // Arrange
    mocks.importarCadastroEmpresa.mockRejectedValueOnce(new Error("Empresa nao permitida"));

    // Act
    const resposta = await requisitar(app, {
      method: "POST",
      url: "/api/contas/importar",
      payload: { empresaOrigemId: empresaA, empresaDestinoId: empresaB, modo: "simples" }
    });

    // Assert
    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toMatchObject({ title: "Empresa nao permitida", status: resposta.statusCode });
  });

  it("Deve_Retornar403_Quando_ServiceBloquearEmpresaNaExportacao", async () => {
    // Arrange
    mocks.exportarCadastroEmpresa.mockRejectedValueOnce(new Error("Empresa nao permitida"));

    // Act
    const resposta = await requisitar(app, {
      method: "POST",
      url: `/api/contas/${registroId}/exportar`,
      payload: { empresaDestinoId: empresaB, modo: "simples" }
    });

    // Assert
    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toMatchObject({ title: "Empresa nao permitida", status: resposta.statusCode });
  });
});


