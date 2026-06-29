import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { criarPerfil, empresaA, empresaB, registroId, requisitar, usuarioId } from "./_helpers.js";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  buscarPerfilUsuario: vi.fn(),
  importarContas: vi.fn(),
  exportarConta: vi.fn(),
  importarFornecedores: vi.fn(),
  exportarFornecedor: vi.fn(),
  importarColaboradores: vi.fn(),
  exportarColaborador: vi.fn(),
  importarCargos: vi.fn(),
  exportarCargo: vi.fn(),
  importarGrupos: vi.fn(),
  exportarGrupo: vi.fn(),
  importarUnidadesMedida: vi.fn(),
  exportarUnidadeMedida: vi.fn(),
  importarAreasSetores: vi.fn(),
  exportarAreaSetor: vi.fn(),
  importarProdutos: vi.fn(),
  exportarProduto: vi.fn(),
  importarMalotes: vi.fn(),
  exportarMalote: vi.fn()
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

vi.mock("../../api/src/contas/contas.service.js", () => ({ importarContas: mocks.importarContas, exportarConta: mocks.exportarConta, listarContas: vi.fn(() => Promise.resolve([])) }));
vi.mock("../../api/src/fornecedores/fornecedores.service.js", () => ({ importarFornecedores: mocks.importarFornecedores, exportarFornecedor: mocks.exportarFornecedor, listarFornecedores: vi.fn(() => Promise.resolve([])) }));
vi.mock("../../api/src/colaboradores/colaboradores.service.js", () => ({
  importarColaboradores: mocks.importarColaboradores,
  exportarColaborador: mocks.exportarColaborador,
  importarCargos: mocks.importarCargos,
  exportarCargo: mocks.exportarCargo,
  listarColaboradores: vi.fn(() => Promise.resolve([])),
  listarCargos: vi.fn(() => Promise.resolve([])),
  listarCargosColaborador: vi.fn(() => Promise.resolve([])),
  listarJornadasColaborador: vi.fn(() => Promise.resolve([])),
  listarFaltasJustificadas: vi.fn(() => Promise.resolve([])),
  criarCargo: vi.fn(),
  atualizarCargo: vi.fn(),
  criarCargoColaborador: vi.fn(),
  atualizarStatusCargoColaborador: vi.fn(),
  criarJornadasColaborador: vi.fn(),
  criarFaltaJustificada: vi.fn()
}));
vi.mock("../../api/src/grupos/grupos.service.js", () => ({ importarGrupos: mocks.importarGrupos, exportarGrupo: mocks.exportarGrupo, listarGrupos: vi.fn(() => Promise.resolve({ gruposDespesas: [], gruposMercadorias: [], gruposRetiradas: [] })) }));
vi.mock("../../api/src/unidades-medida/unidades-medida.service.js", () => ({ importarUnidadesMedida: mocks.importarUnidadesMedida, exportarUnidadeMedida: mocks.exportarUnidadeMedida, listarUnidadesMedida: vi.fn(() => Promise.resolve([])) }));
vi.mock("../../api/src/areas/areas.service.js", () => ({ importarAreasSetores: mocks.importarAreasSetores, exportarAreaSetor: mocks.exportarAreaSetor, listarAreasSetores: vi.fn(() => Promise.resolve({ areas: [], setores: [] })), listarAreas: vi.fn(() => Promise.resolve([])) }));
vi.mock("../../api/src/produtos/produtos.service.js", () => ({ importarProdutos: mocks.importarProdutos, exportarProduto: mocks.exportarProduto, listarProdutos: vi.fn(() => Promise.resolve([])) }));
vi.mock("../../api/src/malotes/malotes.service.js", () => ({
  importarMalotes: mocks.importarMalotes,
  exportarMalote: mocks.exportarMalote,
  listarMalotes: vi.fn(() => Promise.resolve([])),
  listarLacresMalote: vi.fn(() => Promise.resolve([])),
  validarLacre: vi.fn(),
  criarMalote: vi.fn(),
  atualizarMalote: vi.fn(),
  mensagemErroMalote: vi.fn((error: Error) => error.message)
}));

describe("importacao e exportacao de entidades", () => {
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
          "cadastro_contas_criar",
          "cadastro_fornecedores_criar",
          "cadastro_colaboradores_criar",
          "cadastro_grupos_criar",
          "cadastro_unidades_medida_criar",
          "cadastro_areas_setores_criar",
          "cadastro_produtos_criar",
          "cadastro_malotes_criar"
        ],
        { empresaIds: [empresaA, empresaB] }
      )
    );
    for (const chave of Object.keys(mocks)) {
      const mock = mocks[chave as keyof typeof mocks];
      if (typeof mock === "function" && chave.startsWith("importar")) mock.mockResolvedValue({ tipo: chave, modo: "simples", inseridos: 1 });
      if (typeof mock === "function" && chave.startsWith("exportar")) mock.mockResolvedValue({ inseridos: 1 });
    }
  });

  it.each([
    ["/api/contas", mocks.importarContas],
    ["/api/fornecedores", mocks.importarFornecedores],
    ["/api/colaboradores", mocks.importarColaboradores],
    ["/api/cargos", mocks.importarCargos],
    ["/api/grupos", mocks.importarGrupos],
    ["/api/unidades-medida", mocks.importarUnidadesMedida],
    ["/api/areas-setores", mocks.importarAreasSetores],
    ["/api/produtos", mocks.importarProdutos],
    ["/api/malotes", mocks.importarMalotes]
  ])("Deve_ImportarEntidade_Quando_RotaForPermitida", async (baseUrl, importar) => {
    // Arrange
    const payload = { empresaOrigemId: empresaA, empresaDestinoId: empresaB, modo: "simples" };

    // Act
    const resposta = await requisitar(app, { method: "POST", url: `${baseUrl}/importar`, payload });

    // Assert
    expect(resposta.statusCode).toBe(200);
    expect(importar).toHaveBeenCalled();
  });

  it.each([
    ["/api/contas", mocks.exportarConta],
    ["/api/fornecedores", mocks.exportarFornecedor],
    ["/api/colaboradores", mocks.exportarColaborador],
    ["/api/cargos", mocks.exportarCargo],
    ["/api/grupos", mocks.exportarGrupo],
    ["/api/unidades-medida", mocks.exportarUnidadeMedida],
    ["/api/areas-setores", mocks.exportarAreaSetor],
    ["/api/produtos", mocks.exportarProduto],
    ["/api/malotes", mocks.exportarMalote]
  ])("Deve_ExportarEntidade_Quando_RotaForPermitida", async (baseUrl, exportar) => {
    // Arrange
    const payload = { empresaDestinoId: empresaB, modo: "simples" };

    // Act
    const resposta = await requisitar(app, { method: "POST", url: `${baseUrl}/${registroId}/exportar`, payload });

    // Assert
    expect(resposta.statusCode).toBe(200);
    expect(exportar).toHaveBeenCalled();
  });

  it("Deve_Retornar403_Quando_ImportarEntidadeSemPermissaoDoTipo", async () => {
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
    expect(resposta.json()).toMatchObject({ title: "Permissao insuficiente", status: resposta.statusCode, details: { permissao: "cadastro_contas_criar" } });
    expect(mocks.importarContas).not.toHaveBeenCalled();
  });

  it("Deve_Retornar400_Quando_ImportarEntidadeComPayloadInvalido", async () => {
    // Arrange / Act
    const resposta = await requisitar(app, {
      method: "POST",
      url: "/api/contas/importar",
      payload: { empresaOrigemId: empresaA, empresaDestinoId: empresaA, modo: "invalido" }
    });

    // Assert
    expect(resposta.statusCode).toBe(400);
    expect(mocks.importarContas).not.toHaveBeenCalled();
  });

  it("Deve_Retornar403_Quando_ServiceBloquearEmpresaNaImportacao", async () => {
    // Arrange
    mocks.importarContas.mockRejectedValueOnce(new Error("Empresa nao permitida"));

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
    mocks.exportarConta.mockRejectedValueOnce(new Error("Empresa nao permitida"));

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






