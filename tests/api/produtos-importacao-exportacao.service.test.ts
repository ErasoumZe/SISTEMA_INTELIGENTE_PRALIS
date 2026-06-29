import { beforeEach, describe, expect, it, vi } from "vitest";
import { exportarProduto, importarProdutos } from "../../api/src/produtos/produtos.service.js";

const mocks = vi.hoisted(() => ({
  copiarProdutosRepository: vi.fn(),
  copiarGruposRepository: vi.fn(),
  copiarUnidadesMedidaRepository: vi.fn(),
  listarProdutosRepository: vi.fn(),
  salvarProdutoRepository: vi.fn()
}));

vi.mock("../../api/src/produtos/produtos.repository.js", () => ({
  copiarProdutosRepository: mocks.copiarProdutosRepository,
  listarProdutosRepository: mocks.listarProdutosRepository,
  salvarProdutoRepository: mocks.salvarProdutoRepository
}));

vi.mock("../../api/src/grupos/grupos.repository.js", () => ({
  copiarGruposRepository: mocks.copiarGruposRepository
}));

vi.mock("../../api/src/unidades-medida/unidades-medida.repository.js", () => ({
  copiarUnidadesMedidaRepository: mocks.copiarUnidadesMedidaRepository
}));

const empresaA = "11111111-1111-4111-8111-111111111111";
const empresaB = "22222222-2222-4222-8222-222222222222";

const perfil = {
  empresaId: empresaA,
  empresaIds: [empresaA],
  colaboradorId: "colaborador-1",
  setorId: null,
  cargoIds: ["cargo-gerencia"],
  cargos: [{ id: "cargo-gerencia", nome: "Gerencia" }],
  role: "usuario_comum",
  usuarioId: "usuario-1",
  nome: "Usuario",
  email: "usuario@padaria.local",
  permissoes: []
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.copiarProdutosRepository.mockResolvedValue({ tipo: "produtos", inseridos: 2 });
  mocks.copiarGruposRepository.mockResolvedValue({ tipo: "grupos", inseridos: 1 });
  mocks.copiarUnidadesMedidaRepository.mockResolvedValue({ tipo: "unidades", inseridos: 1 });
});

describe("importacao e exportacao de produtos", () => {
  it("bloqueia importacao entre a mesma empresa", async () => {
    await expect(
      importarProdutos({
        empresaOrigemId: empresaA,
        empresaDestinoId: empresaA,
        modo: "simples"
      })
    ).rejects.toThrow("Escolha empresas diferentes");
    expect(mocks.copiarProdutosRepository).not.toHaveBeenCalled();
  });

  it("bloqueia importacao fora do escopo de empresas do perfil", async () => {
    await expect(
      importarProdutos(
        {
          empresaOrigemId: empresaA,
          empresaDestinoId: empresaB,
          modo: "simples"
        },
        perfil
      )
    ).rejects.toThrow("Empresa nao permitida");
  });

  it("expande dependencias no modo completo de produtos", async () => {
    await importarProdutos({
      empresaOrigemId: empresaA,
      empresaDestinoId: empresaB,
      modo: "completo"
    });

    expect(mocks.copiarGruposRepository).toHaveBeenCalledWith({ empresaOrigemId: empresaA }, empresaB, [], "completo");
    expect(mocks.copiarUnidadesMedidaRepository).toHaveBeenCalledWith({ empresaOrigemId: empresaA }, empresaB, [], "completo");
    expect(mocks.copiarProdutosRepository).toHaveBeenCalledWith({ empresaOrigemId: empresaA }, empresaB, [], "completo");
  });

  it("exporta cadastro individual para empresa permitida", async () => {
    await expect(
      exportarProduto(
        "33333333-3333-4333-8333-333333333333",
        {
          empresaDestinoId: empresaA,
          modo: "simples"
        },
        perfil
      )
    ).resolves.toEqual({ tipo: "produtos", inseridos: 2 });
  });
});

