import { beforeEach, describe, expect, it, vi } from "vitest";
import { buscarPerfilUsuario } from "../../api/src/auth/perfil.service.js";

const mocks = vi.hoisted(() => ({
  obterPerfilPorUsuarioId: vi.fn()
}));

vi.mock("../../api/src/auth/perfil.repository.js", () => mocks);

const perfilBase = {
  usuario_id: "usuario-1",
  empresa_id: "11111111-1111-4111-8111-111111111111",
  empresa_ids: ["11111111-1111-4111-8111-111111111111"],
  colaborador_id: "colaborador-1",
  setor_id: null,
  cargo_ids: ["cargo-1"],
  cargos: [{ id: "cargo-1", nome: "Caixa" }],
  nome: "Usuario",
  email: "usuario@email.com",
  regras_permissoes: {
    setor: null,
    cargos: [],
    usuario: null
  }
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("perfil service", () => {
  it("resolve permissoes em camadas usuario sobre cargo sobre setor", async () => {
    mocks.obterPerfilPorUsuarioId.mockResolvedValueOnce({
      ...perfilBase,
      role: "usuario_comum",
      regras_permissoes: {
        setor: { entradas_criar: true, despesas_criar: true },
        cargos: [{ entradas_criar: false, mercadorias_criar: true }],
        usuario: { entradas_criar: true, mercadorias_criar: false }
      }
    });

    await expect(buscarPerfilUsuario("usuario-1")).resolves.toMatchObject({
      role: "usuario_comum",
      permissoes: ["entradas_criar", "despesas_criar"]
    });
  });

  it("nega por padrao quando nenhuma camada define a permissao", async () => {
    mocks.obterPerfilPorUsuarioId.mockResolvedValueOnce({ ...perfilBase, role: "usuario_comum" });

    await expect(buscarPerfilUsuario("usuario-1")).resolves.toMatchObject({
      role: "usuario_comum",
      permissoes: []
    });
  });
});


