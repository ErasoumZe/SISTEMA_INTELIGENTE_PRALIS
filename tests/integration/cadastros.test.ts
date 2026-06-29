import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { colaboradorId, criarPerfil, empresaA, empresaB, registroId, requisitar, usuarioId } from "./_helpers.js";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  buscarPerfilUsuario: vi.fn(),
  salvarCadastro: vi.fn()
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

vi.mock("../../api/src/cadastros/cadastros.service.js", () => ({
  salvarCadastro: mocks.salvarCadastro
}));

describe("cadastros", () => {
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
          "cadastro_empresas",
          "cadastro_contas",
          "cadastro_pdv",
          "cadastro_usuarios",
          "cadastro_permissoes",
          "cadastro_colaboradores"
        ],
        { empresaIds: [empresaA] }
      )
    );
    mocks.salvarCadastro.mockResolvedValue({ id: registroId, empresaId: empresaA, nome: "Registro" });
  });

  it("Deve_Retornar404_Quando_CriarCadastroDeTipoInexistente", async () => {
    // Arrange / Act
    const resposta = await requisitar(app, { method: "POST", url: "/api/cadastros/inexistente", payload: {} });

    // Assert
    expect(resposta.statusCode).toBe(404);
    expect(resposta.json()).toMatchObject({ title: "Cadastro nao encontrado", status: resposta.statusCode });
    expect(mocks.salvarCadastro).not.toHaveBeenCalled();
  });

  it("Deve_Retornar403_Quando_CriarCadastroSemPermissao", async () => {
    // Arrange
    mocks.buscarPerfilUsuario.mockResolvedValueOnce(criarPerfil([], { empresaIds: [empresaA] }));

    // Act
    const resposta = await requisitar(app, {
      method: "POST",
      url: "/api/cadastros/contas",
      payload: { empresaId: empresaA, nome: "Conta" }
    });

    // Assert
    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toMatchObject({ title: "Permissao insuficiente", status: resposta.statusCode, details: { permissao: "cadastro_contas" } });
    expect(mocks.salvarCadastro).not.toHaveBeenCalled();
  });

  it("Deve_CriarCadastro_Quando_TiverPermissaoEEmpresaPermitida", async () => {
    // Arrange
    const payload = { empresaId: empresaA, nome: "Conta" };

    // Act
    const resposta = await requisitar(app, { method: "POST", url: "/api/cadastros/contas", payload });

    // Assert
    expect(resposta.statusCode).toBe(201);
    expect(resposta.json()).toEqual({ ok: true, data: { id: registroId } });
    expect(mocks.salvarCadastro).toHaveBeenCalledWith(
      "contas",
      null,
      payload,
      usuarioId,
      expect.objectContaining({ usuarioId })
    );
  });

  it("Deve_CriarPdv_Quando_TiverPermissaoEEmpresaPermitida", async () => {
    // Arrange
    const payload = {
      empresaId: empresaA,
      nome: "PDV 01",
      codigo: "PDV-01",
      contaId: "77777777-7777-4777-8777-777777777777",
      ativo: true
    };

    // Act
    const resposta = await requisitar(app, { method: "POST", url: "/api/cadastros/pdvs", payload });

    // Assert
    expect(resposta.statusCode).toBe(201);
    expect(resposta.json()).toEqual({ ok: true, data: { id: registroId } });
    expect(mocks.salvarCadastro).toHaveBeenCalledWith(
      "pdvs",
      null,
      payload,
      usuarioId,
      expect.objectContaining({ usuarioId })
    );
  });

  it("Deve_Retornar403_Quando_CriarCadastroParaEmpresaNaoPermitida", async () => {
    // Arrange / Act
    const resposta = await requisitar(app, {
      method: "POST",
      url: "/api/cadastros/contas",
      payload: { empresaId: empresaB, nome: "Conta B" }
    });

    // Assert
    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toMatchObject({ title: "Empresa nao permitida", status: resposta.statusCode });
    expect(mocks.salvarCadastro).not.toHaveBeenCalled();
  });

  it("Deve_Retornar403_Quando_CriarUsuarioComEmpresaVinculadaNaoPermitida", async () => {
    // Arrange / Act
    const resposta = await requisitar(app, {
      method: "POST",
      url: "/api/cadastros/usuarios",
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
    expect(mocks.salvarCadastro).not.toHaveBeenCalled();
  });

  it("Deve_AtualizarCadastro_Quando_TiverPermissaoEEmpresaPermitida", async () => {
    // Arrange
    const payload = { empresaId: empresaA, nome: "Conta Atualizada" };

    // Act
    const resposta = await requisitar(app, { method: "PUT", url: `/api/cadastros/contas/${registroId}`, payload });

    // Assert
    expect(resposta.statusCode).toBe(204);
    expect(resposta.body).toBe("");
    expect(mocks.salvarCadastro).toHaveBeenCalledWith(
      "contas",
      registroId,
      payload,
      usuarioId,
      expect.objectContaining({ usuarioId })
    );
  });

  it("Deve_Retornar403_Quando_AtualizarEmpresaForaDoEscopo", async () => {
    // Arrange / Act
    const resposta = await requisitar(app, {
      method: "PUT",
      url: `/api/cadastros/empresas/${empresaB}`,
      payload: { nome: "Outra empresa" }
    });

    // Assert
    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toMatchObject({ title: "Empresa nao permitida", status: resposta.statusCode });
    expect(mocks.salvarCadastro).not.toHaveBeenCalled();
  });

  it("Deve_Retornar400_Quando_ServiceRejeitarCadastro", async () => {
    // Arrange
    mocks.salvarCadastro.mockRejectedValueOnce(new Error("Email ja cadastrado"));

    // Act
    const resposta = await requisitar(app, {
      method: "POST",
      url: "/api/cadastros/usuarios",
      payload: { nome: "Novo", email: "novo@email.com", colaboradorId, empresaIds: [empresaA], senha: "123456" }
    });

    // Assert
    expect(resposta.statusCode).toBe(400);
    expect(resposta.json()).toMatchObject({ title: "Email ja cadastrado", status: resposta.statusCode });
  });
});


