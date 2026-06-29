import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { criarPerfil, empresaA, empresaB, requisitar, usuarioId } from "./_helpers.js";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  buscarPerfilUsuario: vi.fn(),
  listarEmpresas: vi.fn(),
  listarContas: vi.fn(),
  listarPdvs: vi.fn(),
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

vi.mock("../../api/src/empresas/empresas.service.js", () => ({ listarEmpresas: mocks.listarEmpresas }));
vi.mock("../../api/src/contas/contas.service.js", () => ({ listarContas: mocks.listarContas }));
vi.mock("../../api/src/pdvs/pdvs.service.js", () => ({ listarPdvs: mocks.listarPdvs }));
vi.mock("../../api/src/fornecedores/fornecedores.service.js", () => ({ listarFornecedores: mocks.listarFornecedores }));
vi.mock("../../api/src/colaboradores/colaboradores.service.js", () => ({
  listarColaboradores: mocks.listarColaboradores,
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
vi.mock("../../api/src/grupos/grupos.service.js", () => ({ listarGrupos: mocks.listarGrupos }));
vi.mock("../../api/src/unidades-medida/unidades-medida.service.js", () => ({ listarUnidadesMedida: mocks.listarUnidadesMedida }));
vi.mock("../../api/src/areas/areas.service.js", () => ({ listarAreasSetores: mocks.listarAreasSetores, listarAreas: vi.fn(() => Promise.resolve([])) }));
vi.mock("../../api/src/setores/setores.service.js", () => ({ listarSetores: mocks.listarSetores }));
vi.mock("../../api/src/produtos/produtos.service.js", () => ({ listarProdutos: mocks.listarProdutos }));
vi.mock("../../api/src/usuarios/usuarios.service.js", () => ({ listarUsuarios: mocks.listarUsuarios }));
vi.mock("../../api/src/permissoes/permissoes.service.js", () => ({ listarPermissoes: mocks.listarPermissoes }));

describe("listagens de entidades", () => {
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
          "cadastro_empresas_visualizar",
          "cadastro_contas_visualizar",
          "cadastro_pdv_visualizar",
          "cadastro_fornecedores_visualizar",
          "cadastro_colaboradores_visualizar",
          "cadastro_grupos_visualizar",
          "cadastro_unidades_medida_visualizar",
          "cadastro_areas_setores_visualizar",
          "cadastro_produtos_visualizar",
          "cadastro_usuarios_visualizar",
          "cadastro_permissoes_visualizar"
        ],
        { empresaIds: [empresaA] }
      )
    );
    mocks.listarEmpresas.mockResolvedValue([{ id: empresaA, nome: "Padaria A" }]);
    mocks.listarContas.mockResolvedValue([{ id: "conta-1", empresaId: empresaA }]);
    mocks.listarPdvs.mockResolvedValue([{ id: "pdv-1", empresaId: empresaA }]);
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
    expect(resposta.json()).toMatchObject({ ok: true, data: [{ id: empresaA, nome: "Padaria A" }] });
    expect(mocks.listarEmpresas).toHaveBeenCalledWith(expect.objectContaining({ usuarioId }));
  });

  it.each([
    ["/api/contas", mocks.listarContas],
    ["/api/pdvs", mocks.listarPdvs],
    ["/api/fornecedores", mocks.listarFornecedores],
    ["/api/colaboradores", mocks.listarColaboradores],
    ["/api/grupos", mocks.listarGrupos],
    ["/api/unidades_medida", mocks.listarUnidadesMedida],
    ["/api/areas_setores", mocks.listarAreasSetores],
    ["/api/setores", mocks.listarSetores],
    ["/api/produtos", mocks.listarProdutos]
  ])("Deve_ListarEntidadeDaEmpresaAtiva_Quando_Consultar%s", async (url, listar) => {
    // Arrange / Act
    const resposta = await requisitar(app, { method: "GET", url: `${url}?empresaId=${empresaA}` });

    // Assert
    expect(resposta.statusCode).toBe(200);
    expect(listar).toHaveBeenCalledWith([empresaA]);
  });

  it.each([
    "/api/contas",
    "/api/pdvs",
    "/api/fornecedores",
    "/api/colaboradores",
    "/api/grupos",
    "/api/unidades_medida",
    "/api/areas_setores",
    "/api/setores",
    "/api/produtos",
    "/api/usuarios",
    "/api/permissoes"
  ])("Deve_Retornar403_Quando_ConsultarEntidadeDeEmpresaNaoPermitida", async (url) => {
    // Arrange / Act
    const resposta = await requisitar(app, { method: "GET", url: `${url}?empresaId=${empresaB}` });

    // Assert
    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toMatchObject({ title: "Empresa nao permitida", status: resposta.statusCode });
  });

  it.each([
    ["/api/empresas", "cadastro_empresas_visualizar", mocks.listarEmpresas],
    ["/api/contas", "cadastro_contas_visualizar", mocks.listarContas],
    ["/api/pdvs", "cadastro_pdv_visualizar", mocks.listarPdvs],
    ["/api/fornecedores", "cadastro_fornecedores_visualizar", mocks.listarFornecedores],
    ["/api/colaboradores", "cadastro_colaboradores_visualizar", mocks.listarColaboradores],
    ["/api/grupos", "cadastro_grupos_visualizar", mocks.listarGrupos],
    ["/api/unidades_medida", "cadastro_unidades_medida_visualizar", mocks.listarUnidadesMedida],
    ["/api/areas_setores", "cadastro_areas_setores_visualizar", mocks.listarAreasSetores],
    ["/api/setores", "cadastro_areas_setores_visualizar", mocks.listarSetores],
    ["/api/produtos", "cadastro_produtos_visualizar", mocks.listarProdutos]
  ])("Deve_Retornar403_Quando_Listar%sSemPermissaoVisualizar", async (url, permissao, listar) => {
    // Arrange
    mocks.buscarPerfilUsuario.mockResolvedValueOnce(criarPerfil([], { empresaIds: [empresaA] }));

    // Act
    const resposta = await requisitar(app, { method: "GET", url: `${url}?empresaId=${empresaA}` });

    // Assert
    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toMatchObject({ title: "Permissao insuficiente", status: resposta.statusCode, details: { permissao } });
    expect(listar).not.toHaveBeenCalled();
  });

  it("Deve_Retornar403_Quando_ListarUsuariosSemPermissao", async () => {
    // Arrange
    mocks.buscarPerfilUsuario.mockResolvedValueOnce(criarPerfil([], { empresaIds: [empresaA] }));

    // Act
    const resposta = await requisitar(app, { method: "GET", url: `/api/usuarios?empresaId=${empresaA}` });

    // Assert
    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toMatchObject({ title: "Permissao insuficiente", status: resposta.statusCode, details: { permissao: "cadastro_usuarios_visualizar" } });
    expect(mocks.listarUsuarios).not.toHaveBeenCalled();
  });

  it("Deve_ListarUsuariosNoEscopo_Quando_TiverPermissao", async () => {
    // Arrange / Act
    const resposta = await requisitar(app, { method: "GET", url: `/api/usuarios?empresaId=${empresaA}` });

    // Assert
    expect(resposta.statusCode).toBe(200);
    expect(mocks.listarUsuarios).toHaveBeenCalledWith([empresaA]);
  });

  it("Deve_Retornar403_Quando_ListarPermissoesSemPermissao", async () => {
    // Arrange
    mocks.buscarPerfilUsuario.mockResolvedValueOnce(criarPerfil(["cadastro_usuarios_visualizar"], { empresaIds: [empresaA] }));

    // Act
    const resposta = await requisitar(app, { method: "GET", url: `/api/permissoes?empresaId=${empresaA}` });

    // Assert
    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toMatchObject({ title: "Permissao insuficiente", status: resposta.statusCode, details: { permissao: "cadastro_permissoes_visualizar" } });
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






