import { describe, expect, it } from "vitest";
import { permissoes } from "@padaria/shared";
import { deveComputarMercadoria, saldoCaixa } from "@padaria/api/regras";

describe("permissoes", () => {
  it("mantem permissoes operacionais usadas pela aplicacao", () => {
    expect(permissoes).toEqual(
      expect.arrayContaining([
        "entradas_criar",
        "transferencias_criar",
        "despesas_criar",
        "mercadorias_criar",
        "retiradas_criar",
        "fechamento_com_diferenca_visualizar",
        "relatorio_produtos_visualizar",
        "cadastro_permissoes_visualizar",
        "cadastro_permissoes_criar",
        "cadastro_permissoes_editar",
        "cadastro_permissoes_excluir",
        "relatorio_vendas_visualizar",
        "relatorio_vendas_comprovantes_criar",
        "contas_pagar_visualizar",
        "menu_entradas_somente_caixa_aberto",
        "menu_transferencias_somente_caixa_aberto",
        "menu_relatorio_produtos_somente_caixa_aberto"
      ])
    );
  });
});

describe("regras financeiras", () => {
  it("forca computar mercadoria quando existe nota fiscal", () => {
    expect(deveComputarMercadoria(true, false)).toBe(true);
    expect(deveComputarMercadoria(false, false)).toBe(false);
  });

  it("calcula saldo esperado do caixa", () => {
    expect(
      saldoCaixa({
        totalEntradas: 1000,
        totalTransferencias: 300,
        totalDespesas: 200,
        totalRetiradas: 500
      })
    ).toBe(0);
  });
});

