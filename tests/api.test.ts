import { APP_NAME, temaPadraoAplicacao, type ConfiguracaoAparenciaEmpresa } from "@padaria/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

interface TemaLinhaMock {
  configuracoesAparencia: ConfiguracaoAparenciaEmpresa;
}

type TemaSalvoMock = ConfiguracaoAparenciaEmpresa;

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  buscarPerfilUsuario: vi.fn(),
  criarMaloteRepository: vi.fn(),
  buscarLacrePorEmpresaRepository: vi.fn(),
  buscarMaloteEmpresaRepository: vi.fn(),
  listarEmpresasRepository: vi.fn(),
  listarContasRepository: vi.fn(),
  listarPdvsRepository: vi.fn(),
  temaSelectResults: [] as TemaLinhaMock[][],
  temaSalvo: null as TemaSalvoMock | null
}));

vi.mock("../api/src/auth.js", () => ({
  auth: {
    api: {
      getSession: mocks.getSession
    }
  }
}));

vi.mock("../api/src/malotes/malotes.repository.js", () => ({
  atualizarMaloteRepository: vi.fn(),
  buscarLacrePorEmpresaRepository: mocks.buscarLacrePorEmpresaRepository,
  buscarLacrePorNumeroRepository: vi.fn(),
  buscarMaloteEmpresaRepository: mocks.buscarMaloteEmpresaRepository,
  criarMaloteRepository: mocks.criarMaloteRepository,
  listarLacresMaloteRepository: vi.fn(),
  listarMalotesRepository: vi.fn()
}));

vi.mock("../api/src/catalogos/catalogos.repository.js", () => ({
  listarAreasRepository: vi.fn(() => Promise.resolve([])),
  listarColaboradoresRepository: vi.fn(() => Promise.resolve([])),
  listarContasRepository: mocks.listarContasRepository,
  listarPdvsRepository: mocks.listarPdvsRepository,
  listarEmpresasRepository: mocks.listarEmpresasRepository,
  listarFornecedoresRepository: vi.fn(() => Promise.resolve([])),
  listarGruposRepository: vi.fn(() =>
    Promise.resolve({ gruposDespesas: [], gruposMercadorias: [], gruposRetiradas: [] })
  ),
  listarPermissoesRepository: vi.fn(() =>
    Promise.resolve({
      permissoes: [],
      cargos: [],
      cargosPermissoes: [],
      setores: [],
      setoresPermissoes: [],
      usuarios: [],
      usuariosPermissoes: []
    })
  ),
  listarProdutosRepository: vi.fn(() => Promise.resolve([])),
  listarSetoresRepository: vi.fn(() => Promise.resolve([])),
  listarUnidadesMedidaRepository: vi.fn(() => Promise.resolve([])),
  listarUsuariosRepository: vi.fn(() => Promise.resolve([]))
}));

vi.mock("../api/src/banco/conexao.js", () => ({
  banco: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve(mocks.temaSelectResults.shift() ?? []))
        }))
      }))
    })),
    insert: vi.fn(() => ({
      values: vi.fn((payload: TemaSalvoMock) => {
        mocks.temaSalvo = payload;
        return {
          onConflictDoUpdate: vi.fn(() => ({
            returning: vi.fn(() => Promise.resolve([payload]))
          }))
        };
      })
    })),
    update: vi.fn(() => ({
      set: vi.fn((payload: { configuracoesAparencia: ConfiguracaoAparenciaEmpresa }) => {
        mocks.temaSalvo = payload.configuracoesAparencia;
        return {
          where: vi.fn(() => ({
            returning: vi.fn(() => Promise.resolve([{ configuracoesAparencia: payload.configuracoesAparencia }]))
          }))
        };
      })
    })),
    transaction: vi.fn()
  },
  executarEmTransacao: vi.fn((callback: (tx: object) => unknown) => Promise.resolve(callback({})))
}));

vi.mock("../api/src/perfis.js", () => ({
  buscarPerfilUsuario: mocks.buscarPerfilUsuario
}));

let app: FastifyInstance;
const empresaA = "11111111-1111-4111-8111-111111111111";
const empresaB = "33333333-3333-4333-8333-333333333333";

beforeAll(async () => {
  const { buildApp } = await import("../api/src/app.js");
  app = await buildApp();
}, 30_000);

afterAll(async () => {
  await app?.close();
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: "usuario-teste" } });
  mocks.buscarPerfilUsuario.mockResolvedValue({
    usuarioId: "usuario-teste",
    nome: "Usuario Teste",
    email: "teste@padaria.local",
    empresaId: empresaA,
    empresaIds: [empresaA],
    colaboradorId: "colaborador-teste",
    setorId: null,
    cargoIds: ["cargo-tesouraria"],
    cargos: [{ id: "cargo-tesouraria", nome: "Tesouraria" }],
    role: "usuario_comum",
    permissoes: ["cadastro_malotes_criar", "cadastro_malotes_editar", "transferencias_criar", "transferencias_visualizar", "relatorio_vendas_visualizar"]
  });
  mocks.criarMaloteRepository.mockResolvedValue({ id: null });
  mocks.buscarLacrePorEmpresaRepository.mockResolvedValue(null);
  mocks.buscarMaloteEmpresaRepository.mockResolvedValue({ empresaId: empresaA });
  mocks.listarEmpresasRepository.mockResolvedValue([]);
  mocks.listarContasRepository.mockResolvedValue([]);
  mocks.listarPdvsRepository.mockResolvedValue([]);
  mocks.temaSelectResults = [];
  mocks.temaSalvo = null;
});

describe("api", () => {
  it("returns the health payload", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/health"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ok: true,
      data: {
        status: "ok",
        service: "api",
        app: APP_NAME
      }
    });
  });

  it("rejects protected endpoints without authentication", async () => {
    mocks.getSession.mockResolvedValueOnce(null);

    const response = await app.inject({
      method: "GET",
      url: "/api/empresas"
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ title: "Nao autenticado", status: response.statusCode });
    expect(mocks.buscarPerfilUsuario).not.toHaveBeenCalled();
  });

  it("returns the current session with profile", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/me"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      data: {
        user: { id: "usuario-teste" },
        perfil: {
          usuarioId: "usuario-teste",
          colaboradorId: "colaborador-teste"
        }
      }
    });
  });

  it("creates a malote when all lacres are unique", async () => {
    const maloteId = "22222222-2222-4222-8222-222222222222";

    mocks.criarMaloteRepository.mockResolvedValueOnce({ id: maloteId });

    const response = await app.inject({
      method: "POST",
      url: "/api/malotes",
      payload: {
        empresaId: empresaA,
        codigo: " MALOTE-001 ",
        lacres: [" LACRE-001 ", "LACRE-002"]
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ ok: true, data: { id: maloteId } });
    expect(mocks.criarMaloteRepository).toHaveBeenCalledWith({
      empresaId: empresaA,
      codigo: "MALOTE-001",
      lacres: ["LACRE-001", "LACRE-002"],
      usuarioId: "usuario-teste"
    });
  });

  it("rejects duplicate lacres in the same malote payload", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/malotes",
      payload: {
        empresaId: empresaA,
        codigo: "MALOTE-001",
        lacres: ["LACRE-001", " lacre-001 "]
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ title: "Lacre duplicado: lacre-001", status: response.statusCode });
    expect(mocks.criarMaloteRepository).not.toHaveBeenCalled();
  });

  it("rejects lacres already registered in another malote", async () => {
    mocks.buscarLacrePorEmpresaRepository.mockResolvedValueOnce({ numero: "LACRE-001" });

    const response = await app.inject({
      method: "POST",
      url: "/api/malotes",
      payload: {
        empresaId: empresaA,
        codigo: "MALOTE-002",
        lacres: ["lacre-001"]
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ title: "Lacre ja cadastrado: LACRE-001", status: response.statusCode });
    expect(mocks.criarMaloteRepository).not.toHaveBeenCalled();
  });

  it("rejects duplicate lacres when editing a malote", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/api/malotes/22222222-2222-4222-8222-222222222222",
      payload: {
        codigo: "MALOTE-001",
        lacres: ["LACRE-003", "lacre-003"]
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ title: "Lacre duplicado: lacre-003", status: response.statusCode });
    expect(mocks.criarMaloteRepository).not.toHaveBeenCalled();
  });

  it("rejects creating data for another company", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/malotes",
      payload: {
        empresaId: empresaB,
        codigo: "MALOTE-EMPRESA-B",
        lacres: ["LACRE-B-001"]
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ title: "Empresa nao permitida", status: response.statusCode });
    expect(mocks.criarMaloteRepository).not.toHaveBeenCalled();
  });

  it("filters company list to the authenticated user's companies", async () => {
    mocks.listarEmpresasRepository.mockResolvedValueOnce([
      { id: empresaA, nome: "Empresa A" },
      { id: empresaB, nome: "Empresa B" }
    ]);

    const response = await app.inject({
      method: "GET",
      url: "/api/empresas"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, data: [{ id: empresaA, nome: "Empresa A" }] });
  });

  it("filters account data to the authenticated user's company", async () => {
    mocks.listarContasRepository.mockResolvedValueOnce([
      { id: "conta-a", empresaId: empresaA, nome: "Conta A" },
      { id: "conta-b", empresaId: empresaB, nome: "Conta B" }
    ]);

    const response = await app.inject({
      method: "GET",
      url: "/api/contas"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, data: [{ id: "conta-a", empresaId: empresaA, nome: "Conta A" }] });
  });

  it("blocks venda listing for another company", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/vendas?empresaId=${empresaB}`
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ title: "Empresa nao permitida", status: response.statusCode });
    expect(mocks.listarContasRepository).not.toHaveBeenCalled();
  });

  it("blocks despesa creation when the user lacks the entity permission", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/despesas",
      payload: {
        empresaId: empresaA,
        dataReferencia: "2026-06-10",
        dataVencimento: "2026-06-10",
        descricao: "Despesa sem permissao",
        valorOriginal: 10,
        grupoDespesaId: "44444444-4444-4444-8444-444444444444"
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ title: "Permissao insuficiente", status: response.statusCode, details: { permissao: "despesas_criar" } });
    expect(mocks.criarMaloteRepository).not.toHaveBeenCalled();
  });

  it("blocks account data for a company outside the user's allowed companies", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/contas?empresaId=${empresaB}`
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ title: "Empresa nao permitida", status: response.statusCode });
    expect(mocks.listarContasRepository).not.toHaveBeenCalled();
  });

  it("filters account data by the active company for users with multiple companies", async () => {
    mocks.buscarPerfilUsuario.mockResolvedValueOnce({
      usuarioId: "usuario-multi",
      nome: "Usuario Multi",
      email: "multi@padaria.local",
      empresaId: empresaA,
      empresaIds: [empresaA, empresaB],
      colaboradorId: "colaborador-multi",
      setorId: null,
      cargoIds: ["cargo-gerencia"],
      cargos: [{ id: "cargo-gerencia", nome: "Gerencia" }],
      role: "usuario_comum",
      permissoes: ["transferencias_criar"]
    });
    mocks.listarContasRepository.mockResolvedValueOnce([
      { id: "conta-a", empresaId: empresaA, nome: "Conta A" },
      { id: "conta-b", empresaId: empresaB, nome: "Conta B" }
    ]);

    const response = await app.inject({
      method: "GET",
      url: `/api/contas?empresaId=${empresaB}`
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, data: [{ id: "conta-b", empresaId: empresaB, nome: "Conta B" }] });
  });

  it("does not grant global company access by cargo name", async () => {
    mocks.buscarPerfilUsuario.mockResolvedValueOnce({
      usuarioId: "diretor",
      nome: "Diretor Geral",
      email: "diretor@padaria.local",
      empresaId: empresaA,
      empresaIds: [empresaA],
      colaboradorId: "colaborador-diretor",
      setorId: null,
      cargoIds: ["cargo-diretor"],
      cargos: [{ id: "cargo-diretor", nome: "Diretor Geral" }],
      role: "usuario_comum",
      permissoes: ["cadastro_empresas_criar", "cadastro_usuarios_criar"]
    });
    mocks.listarEmpresasRepository.mockResolvedValueOnce([
      { id: empresaA, nome: "Empresa A" },
      { id: empresaB, nome: "Empresa B" }
    ]);

    const response = await app.inject({
      method: "GET",
      url: "/api/empresas"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, data: [{ id: empresaA, nome: "Empresa A" }] });
  });

  it("returns screen theme when configured", async () => {
    mocks.temaSelectResults = [
      [
        {
          configuracoesAparencia: {
            padrao: temaPadraoAplicacao,
            especifico: [
              {
                pagina: "caixa",
                propriedades: {
                  corPrimaria: "#111111",
                  corSecundaria: "#222222",
                  corFundo: "#333333",
                  corCartao: "#444444",
                  corSucesso: "#555555",
                  corAviso: "#666666",
                  corErro: "#777777"
                }
              }
            ]
          }
        }
      ]
    ];

    const response = await app.inject({
      method: "GET",
      url: `/api/tema?tela=caixa&empresaId=${empresaA}`
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ok: true,
      data: {
        corPrimaria: "#111111",
        corSecundaria: "#222222",
        corFundo: "#333333",
        corCartao: "#444444",
        corSucesso: "#555555",
        corAviso: "#666666",
        corErro: "#777777"
      }
    });
  });

  it("falls back to default theme when screen theme does not exist", async () => {
    mocks.temaSelectResults = [
      [
        {
          configuracoesAparencia: {
            padrao: temaPadraoAplicacao,
            especifico: []
          }
        }
      ]
    ];

    const response = await app.inject({
      method: "GET",
      url: `/api/tema?tela=inexistente&empresaId=${empresaA}`
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      data: {
        corPrimaria: "#6d28d9",
        corSecundaria: "#0891b2"
      }
    });
  });

  it("updates theme when user has permission", async () => {
    mocks.buscarPerfilUsuario.mockResolvedValueOnce({
      usuarioId: "diretor",
      nome: "Diretor Geral",
      email: "diretor@padaria.local",
      empresaId: empresaA,
      empresaIds: [empresaA],
      colaboradorId: "colaborador-diretor",
      setorId: null,
      cargoIds: ["cargo-diretor"],
      cargos: [{ id: "cargo-diretor", nome: "Diretor Geral" }],
      role: "usuario_comum",
      permissoes: ["aparencia_editar"]
    });

    const payload = {
      empresaId: empresaA,
      tela: "padrao",
      corPrimaria: "#111111",
      corSecundaria: "#222222",
      corFundo: "#333333",
      corCartao: "#444444",
      corSucesso: "#555555",
      corAviso: "#666666",
      corErro: "#777777"
    };

    const response = await app.inject({
      method: "PUT",
      url: "/api/tema",
      payload
    });

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe("");
    expect(mocks.temaSalvo).toMatchObject({
      padrao: {
        corPrimaria: "#111111",
        corSecundaria: "#222222",
        corFundo: "#333333",
        corCartao: "#444444",
        corSucesso: "#555555",
        corAviso: "#666666",
        corErro: "#777777"
      },
      especifico: []
    });
  });

  it("blocks theme update without permission", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/api/tema",
      payload: {
        empresaId: empresaA,
        tela: "padrao",
        corPrimaria: "#111111",
        corSecundaria: "#222222",
        corFundo: "#333333",
        corCartao: "#444444",
        corSucesso: "#555555",
        corAviso: "#666666",
        corErro: "#777777"
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ title: "Permissao insuficiente", status: response.statusCode, details: { permissao: "aparencia_editar" } });
  });
});



