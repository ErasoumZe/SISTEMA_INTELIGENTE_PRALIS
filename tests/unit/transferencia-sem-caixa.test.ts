import { describe, expect, it } from "vitest";
import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import { podeTransferirSemCaixa } from "../../api/src/transferencias/transferencias.service.js";

function perfil(cargo: string, role: PerfilUsuario["role"] = "usuario_comum"): PerfilUsuario {
  return {
    usuarioId: "u",
    colaboradorId: "c",
    cargoIds: ["cargo"],
    cargos: [{ id: "cargo", nome: cargo }],
    role,
    nome: cargo,
    email: `${cargo}@teste.local`,
    permissoes: []
  };
}

describe("R-032 - perfis que transferem sem caixa aberto", () => {
  it.each(["Tesouraria", "Gerência", "Financeiro", "Diretor Geral"])("libera %s", (cargo) => {
    expect(podeTransferirSemCaixa(perfil(cargo))).toBe(true);
  });

  it("libera usuario_admin e admin independentemente do cargo", () => {
    expect(podeTransferirSemCaixa(perfil("Outro", "usuario_admin"))).toBe(true);
    expect(podeTransferirSemCaixa(perfil("Outro", "admin"))).toBe(true);
  });

  it("mantem o cargo Caixa dependente de caixa aberto", () => {
    expect(podeTransferirSemCaixa(perfil("Caixa"))).toBe(false);
  });
});
