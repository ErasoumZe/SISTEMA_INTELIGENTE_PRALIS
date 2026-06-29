import { beforeEach, describe, expect, it, vi } from "vitest";
import { exportarCadastroEmpresa, importarCadastroEmpresa } from "../../api/src/copia/copia.service.js";

const mocks = vi.hoisted(() => ({
  copiarDadosEmpresaRepository: vi.fn()
}));

vi.mock("../../api/src/copia/copia.repository.js", () => mocks);

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
  mocks.copiarDadosEmpresaRepository.mockResolvedValue({ tipo: "contas", inseridos: 2 });
});

describe("copia service", () => {
  it("bloqueia importacao entre a mesma empresa", async () => {
    await expect(
      importarCadastroEmpresa("contas", {
        empresaOrigemId: empresaA,
        empresaDestinoId: empresaA,
        modo: "simples"
      })
    ).rejects.toThrow("Escolha empresas diferentes");
    expect(mocks.copiarDadosEmpresaRepository).not.toHaveBeenCalled();
  });

  it("bloqueia importacao fora do escopo de empresas do perfil", async () => {
    await expect(
      importarCadastroEmpresa(
        "contas",
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
    await importarCadastroEmpresa("produtos", {
      empresaOrigemId: empresaA,
      empresaDestinoId: empresaB,
      modo: "completo"
    });

    expect(mocks.copiarDadosEmpresaRepository).toHaveBeenCalledTimes(3);
    expect(mocks.copiarDadosEmpresaRepository).toHaveBeenNthCalledWith(
      1,
      "grupos",
      { empresaOrigemId: empresaA },
      empresaB,
      [],
      "completo"
    );
    expect(mocks.copiarDadosEmpresaRepository).toHaveBeenNthCalledWith(
      3,
      "produtos",
      { empresaOrigemId: empresaA },
      empresaB,
      [],
      "completo"
    );
  });

  it("exporta cadastro individual para empresa permitida", async () => {
    await expect(
      exportarCadastroEmpresa(
        "contas",
        "33333333-3333-4333-8333-333333333333",
        {
          empresaDestinoId: empresaA,
          modo: "simples"
        },
        perfil
      )
    ).resolves.toEqual({ tipo: "contas", inseridos: 2 });
  });
});

