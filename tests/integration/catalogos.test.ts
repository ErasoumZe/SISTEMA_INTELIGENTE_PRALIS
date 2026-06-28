import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { criarPerfil, empresaA, empresaB, requisitar, usuarioId } from "./_helpers.js";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  buscarPerfilUsuario: vi.fn(),
  listarEmpresas: vi.fn(),
  listarContas: vi.fn(),
  listarFornecedores: vi.fn(),
  listarColaboradores: vi.fn(),
  listarGrupos: vi.fn(),
  listarUnidadesMedida: vi.fn(),
  listarAreasSetores: vi.fn(),
  listarSetores: vi.fn(),
  listarProdutos: vi.fn(),
  listarUsuarios: vi.fn(),
  listarPermissoes: vi.fn()
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

vi.mock("../../api/src/catalogos/catalogos.service.js", () => ({
  listarEmpresas: mocks.listarEmpresas,
  listarContas: mocks.listarContas,
  listarFornecedores: mocks.listarFornecedores,
  listarColaboradores: mocks.listarColaboradores,
  listarGrupos: mocks.listarGrupos,
  listarUnidadesMedida: mocks.listarUnidadesMedida,
  listarAreasSetores: mocks.listarAreasSetores,
  listarSetores: mocks.listarSetores,
  listarProdutos: mocks.listarProdutos,
  listarUsuarios: mocks.listarUsuarios,
  listarPermissoes: mocks.listarPermissoes
}));

describe("catalogos", () => {
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
      criarPerfil(["cadastro_usuarios", "cadastro_permissoes"], { empresaIds: [empresaA] })
    );
    mocks.listarEmpresas.mockResolvedValue([{ id: empresaA, nome: "Padaria A" }]);
    mocks.listarContas.mockResolvedValue([{ id: "conta-1", empresaId: empresaA }]);
    mocks.listarFornecedores.mockResolvedValue([]);
    mocks.listarColaboradores.mockResolvedValue([]);
    mocks.listarGrupos.mockResolvedValue({ gruposDespesas: [], gruposMercadorias: [], gruposRetiradas: [] });
    mocks.listarUnidadesMedida.mockResolvedValue([]);
    mocks.listarAreasSetores.mockResolvedValue({ areas: [], setores: [] });
    mocks.listarSetores.mockResolvedValue([]);
    mocks.listarProdutos.mockResolvedValue([]);
    mocks.listarUsuarios.mockResolvedValue([]);
    mocks.listarPermissoes.mockResolvedValue({ permissoes: [], cargos: [], cargosPermissoes: [] });
  });

  it("Deve_Retornar401_Quando_ListarEmpresasSemSessao", async () => {
    // Arrange
    mocks.getSession.mockResolvedValueOnce(null);

    // Act
    const resposta = await app.inject({ method: "GET", url: "/api/empresas" });

    // Assert
    expect(resposta.statusCode).toBe(401);
    expect(mocks.listarEmpresas).not.toHaveBeenCalled();
  });

  it("Deve_ListarEmpresasPermitidas_Quando_UsuarioAutenticado", async () => {
    // Arrange / Act
    const resposta = await requisitar(app, { method: "GET", url: "/api/empresas" });

    // Assert
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual([{ id: empresaA, nome: "Padaria A" }]);
    expect(mocks.listarEmpresas).toHaveBeenCalledWith(expect.objectContaining({ usuarioId }));
  });

  it.each([
    ["/api/contas", mocks.listarContas],
    ["/api/fornecedores", mocks.listarFornecedores],
    ["/api/colaboradores", mocks.listarColaboradores],
    ["/api/grupos", mocks.listarGrupos],
    ["/api/unidades_medida", mocks.listarUnidadesMedida],
    ["/api/areas_setores", mocks.listarAreasSetores],
    ["/api/setores", mocks.listarSetores],
    ["/api/produtos", mocks.listarProdutos]
  ])("Deve_ListarCatalogoDaEmpresaAtiva_Quando_Consultar%s", async (url, listar) => {
    // Arrange / Act
    const resposta = await requisitar(app, { method: "GET", url: `${url}?empresaId=${empresaA}` });

    // Assert
    expect(resposta.statusCode).toBe(200);
    expect(listar).toHaveBeenCalledWith([empresaA]);
  });

  it.each([
    "/api/contas",
    "/api/fornecedores",
    "/api/colaboradores",
    "/api/grupos",
    "/api/unidades_medida",
    "/api/areas_setores",
    "/api/setores",
    "/api/produtos",
    "/api/usuarios",
    "/api/permissoes"
  ])("Deve_Retornar403_Quando_ConsultarCatalogoDeEmpresaNaoPermitida", async (url) => {
    // Arrange / Act
    const resposta = await requisitar(app, { method: "GET", url: `${url}?empresaId=${empresaB}` });

    // Assert
    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toEqual({ erro: "Empresa nao permitida" });
  });

  it("Deve_Retornar403_Quando_ListarUsuariosSemPermissao", async () => {
    // Arrange
    mocks.buscarPerfilUsuario.mockResolvedValueOnce(criarPerfil([], { empresaIds: [empresaA] }));

    // Act
    const resposta = await requisitar(app, { method: "GET", url: `/api/usuarios?empresaId=${empresaA}` });

    // Assert
    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toEqual({ erro: "Permissao insuficiente", permissao: "cadastro_usuarios" });
    expect(mocks.listarUsuarios).not.toHaveBeenCalled();
  });

  it("Deve_ListarUsuariosNoEscopo_Quando_TiverPermissao", async () => {
    // Arrange / Act
    const resposta = await requisitar(app, { method: "GET", url: `/api/usuarios?empresaId=${empresaA}` });

    // Assert
    expect(resposta.statusCode).toBe(200);
    expect(mocks.listarUsuarios).toHaveBeenCalledWith([empresaA], [empresaA]);
  });

  it("Deve_Retornar403_Quando_ListarPermissoesSemPermissao", async () => {
    // Arrange
    mocks.buscarPerfilUsuario.mockResolvedValueOnce(criarPerfil(["cadastro_usuarios"], { empresaIds: [empresaA] }));

    // Act
    const resposta = await requisitar(app, { method: "GET", url: `/api/permissoes?empresaId=${empresaA}` });

    // Assert
    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toEqual({ erro: "Permissao insuficiente", permissao: "cadastro_permissoes" });
    expect(mocks.listarPermissoes).not.toHaveBeenCalled();
  });

  it("Deve_ListarPermissoesNoEscopo_Quando_TiverPermissao", async () => {
    // Arrange / Act
    const resposta = await requisitar(app, { method: "GET", url: `/api/permissoes?empresaId=${empresaA}` });

    // Assert
    expect(resposta.statusCode).toBe(200);
    expect(mocks.listarPermissoes).toHaveBeenCalledWith([empresaA], [empresaA]);
  });
});
