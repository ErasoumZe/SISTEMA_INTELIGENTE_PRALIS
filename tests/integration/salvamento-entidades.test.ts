import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { colaboradorId, criarPerfil, empresaA, empresaB, registroId, requisitar, usuarioId } from "./_helpers.js";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  buscarPerfilUsuario: vi.fn(),
  salvarConta: vi.fn(),
  salvarPdv: vi.fn(),
  salvarUsuario: vi.fn(),
  salvarEmpresa: vi.fn()
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

vi.mock("../../api/src/contas/contas.service.js", () => ({ salvarConta: mocks.salvarConta, listarContas: vi.fn(() => Promise.resolve([])) }));
vi.mock("../../api/src/pdvs/pdvs.service.js", () => ({ salvarPdv: mocks.salvarPdv, listarPdvs: vi.fn(() => Promise.resolve([])) }));
vi.mock("../../api/src/usuarios/usuarios.service.js", () => ({ salvarUsuario: mocks.salvarUsuario, listarUsuarios: vi.fn(() => Promise.resolve([])) }));
vi.mock("../../api/src/empresas/empresas.service.js", () => ({ salvarEmpresa: mocks.salvarEmpresa, listarEmpresas: vi.fn(() => Promise.resolve([])) }));

describe("salvamento de entidades", () => {
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
          "cadastro_empresas_criar",
          "cadastro_contas_criar",
          "cadastro_pdv_criar",
          "cadastro_usuarios_criar",
          "cadastro_permissoes_criar",
          "cadastro_colaboradores_criar",
          "cadastro_contas_editar",
          "cadastro_empresas_editar"
        ],
        { empresaIds: [empresaA] }
      )
    );
    mocks.salvarConta.mockResolvedValue({ id: registroId, empresaId: empresaA, nome: "Registro" });
    mocks.salvarPdv.mockResolvedValue({ id: registroId, empresaId: empresaA, nome: "Registro" });
    mocks.salvarUsuario.mockResolvedValue({ id: registroId, empresaId: empresaA, nome: "Registro" });
    mocks.salvarEmpresa.mockResolvedValue({ id: registroId, empresaId: empresaA, nome: "Registro" });
  });

  it("Deve_Retornar403_Quando_CriarEntidadeSemPermissao", async () => {
    // Arrange
    mocks.buscarPerfilUsuario.mockResolvedValueOnce(criarPerfil([], { empresaIds: [empresaA] }));

    // Act
    const resposta = await requisitar(app, {
      method: "POST",
      url: "/api/contas",
      payload: { empresaId: empresaA, nome: "Conta" }
    });

    // Assert
    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toMatchObject({ title: "Permissao insuficiente", status: resposta.statusCode, details: { permissao: "cadastro_contas_criar" } });
    expect(mocks.salvarConta).not.toHaveBeenCalled();
  });

  it("Deve_CriarEntidade_Quando_TiverPermissaoEEmpresaPermitida", async () => {
    // Arrange
    const payload = { empresaId: empresaA, nome: "Conta" };

    // Act
    const resposta = await requisitar(app, { method: "POST", url: "/api/contas", payload });

    // Assert
    expect(resposta.statusCode).toBe(201);
    expect(resposta.json()).toEqual({ ok: true, data: { id: registroId } });
    expect(mocks.salvarConta).toHaveBeenCalledWith(null, payload);
  });

  it("Deve_CriarPdv_Quando_TiverPermissaoEEmpresaPermitida", async () => {
    // Arrange
    const payload = {
      empresaId: empresaA,
      nome: "PDV 01",
      contaId: "77777777-7777-4777-8777-777777777777",
      ativo: true
    };

    // Act
    const resposta = await requisitar(app, { method: "POST", url: "/api/pdvs", payload });

    // Assert
    expect(resposta.statusCode).toBe(201);
    expect(resposta.json()).toEqual({ ok: true, data: { id: registroId } });
    expect(mocks.salvarPdv).toHaveBeenCalledWith(null, payload);
  });

  it("Deve_Retornar403_Quando_CriarEntidadeParaEmpresaNaoPermitida", async () => {
    // Arrange / Act
    const resposta = await requisitar(app, {
      method: "POST",
      url: "/api/contas",
      payload: { empresaId: empresaB, nome: "Conta B" }
    });

    // Assert
    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toMatchObject({ title: "Empresa nao permitida", status: resposta.statusCode });
    expect(mocks.salvarConta).not.toHaveBeenCalled();
  });

  it("Deve_Retornar403_Quando_CriarUsuarioComEmpresaVinculadaNaoPermitida", async () => {
    // Arrange / Act
    const resposta = await requisitar(app, {
      method: "POST",
      url: "/api/usuarios",
      payload: {
        nome: "Novo Usuario",
        email: "novo@email.com",
        colaboradorId,
        empresaIds: [empresaA, empresaB],
        senha: "123456"
      }
    });

    // Assert
    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toMatchObject({ title: "Empresa nao permitida", status: resposta.statusCode });
    expect(mocks.salvarUsuario).not.toHaveBeenCalled();
  });

  it("Deve_AtualizarEntidade_Quando_TiverPermissaoEEmpresaPermitida", async () => {
    // Arrange
    const payload = { empresaId: empresaA, nome: "Conta Atualizada" };

    // Act
    const resposta = await requisitar(app, { method: "PUT", url: `/api/contas/${registroId}`, payload });

    // Assert
    expect(resposta.statusCode).toBe(204);
    expect(resposta.body).toBe("");
    expect(mocks.salvarConta).toHaveBeenCalledWith(registroId, payload);
  });

  it("Deve_Retornar403_Quando_AtualizarEmpresaForaDoEscopo", async () => {
    // Arrange / Act
    const resposta = await requisitar(app, {
      method: "PUT",
      url: `/api/empresas/${empresaB}`,
      payload: { nome: "Outra empresa" }
    });

    // Assert
    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toMatchObject({ title: "Empresa nao permitida", status: resposta.statusCode });
    expect(mocks.salvarEmpresa).not.toHaveBeenCalled();
  });

  it("Deve_Retornar400_Quando_ServiceRejeitarEntidade", async () => {
    // Arrange
    mocks.salvarUsuario.mockRejectedValueOnce(new Error("Email ja cadastrado"));

    // Act
    const resposta = await requisitar(app, {
      method: "POST",
      url: "/api/usuarios",
      payload: { nome: "Novo", email: "novo@email.com", colaboradorId, empresaIds: [empresaA], senha: "123456" }
    });

    // Assert
    expect(resposta.statusCode).toBe(400);
    expect(resposta.json()).toMatchObject({ title: "Email ja cadastrado", status: resposta.statusCode });
  });
});






