// D3: "So Admin, Gerencia e Financeiro podem usar recorrencia."
//
// Essa regra e de CATALOGO DE CARGO, e nao de rota — quem a materializa e o padrao de permissoes
// por cargo (usado pelo seed de producao e pelo "restaurar padrao do cargo"). Testar aqui pega a
// regressao silenciosa: alguem adicionar a permissao ao cargo errado passaria batido num teste de
// rota, que so olha um perfil por vez.
import { describe, expect, it } from "vitest";
import { permissoesPorCargo } from "@padaria/db/referencia-permissoes";
import { permissoesAcessoTotal } from "@padaria/shared";

const PERMISSAO = "lancamentos_recorrencia_criar";

describe("permissao de recorrencia por cargo (D3)", () => {
  it("Gerencia e Financeiro tem", () => {
    expect(permissoesPorCargo["Gerencia"]).toContain(PERMISSAO);
    expect(permissoesPorCargo["Financeiro"]).toContain(PERMISSAO);
  });

  it("Admin tem pela via do acesso total (usuario_admin), sem estar num cargo", () => {
    // Recorrencia CONCEDE (nao restringe), entao entra em permissoesAcessoTotal — que e o que o
    // usuario_admin recebe desde o fix de 29/07 (admin nao herda as flags _somente_caixa_aberto).
    expect(permissoesAcessoTotal).toContain(PERMISSAO);
  });

  it("nenhum outro cargo tem", () => {
    const comPermissao = Object.entries(permissoesPorCargo)
      .filter(([, permissoes]) => permissoes.includes(PERMISSAO))
      .map(([cargo]) => cargo)
      .sort();
    expect(comPermissao).toEqual(["Financeiro", "Gerencia"]);
  });

  it("Caixa e Tesouraria explicitamente NAO tem", () => {
    // Os dois lancam (Caixa) ou operam dinheiro (Tesouraria) — e justamente por isso a regra existe.
    expect(permissoesPorCargo["Caixa"]).not.toContain(PERMISSAO);
    expect(permissoesPorCargo["Tesouraria"]).not.toContain(PERMISSAO);
  });
});
