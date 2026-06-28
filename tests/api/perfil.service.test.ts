import { permissoes } from "@padaria/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buscarPerfilUsuario } from "../../api/src/perfis/perfil.service.js";

const mocks = vi.hoisted(() => ({
  obterPerfilPorUsuarioId: vi.fn()
}));

vi.mock("../../api/src/perfis/perfil.repository.js", () => mocks);

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
  permissoes: ["entradas"]
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("perfil service", () => {
  it("concede todas as permissoes para usuario_admin", async () => {
    mocks.obterPerfilPorUsuarioId.mockResolvedValueOnce({ ...perfilBase, role: "usuario_admin" });

    await expect(buscarPerfilUsuario("usuario-1")).resolves.toMatchObject({
      role: "usuario_admin",
      permissoes
    });
  });

  it("nao concede permissoes extras para usuario_comum", async () => {
    mocks.obterPerfilPorUsuarioId.mockResolvedValueOnce({ ...perfilBase, role: "usuario_comum" });

    await expect(buscarPerfilUsuario("usuario-1")).resolves.toMatchObject({
      role: "usuario_comum",
      permissoes: ["entradas"]
    });
  });

  it("nao concede permissoes extras para admin enquanto o role esta reservado", async () => {
    mocks.obterPerfilPorUsuarioId.mockResolvedValueOnce({ ...perfilBase, role: "admin" });

    await expect(buscarPerfilUsuario("usuario-1")).resolves.toMatchObject({
      role: "admin",
      permissoes: ["entradas"]
    });
  });
});
