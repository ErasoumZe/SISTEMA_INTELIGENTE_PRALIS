import { describe, expect, it } from "vitest";
import { permissoes } from "@padaria/shared";
import { deveComputarMercadoria, saldoCaixa } from "@padaria/api/regras";

describe("permissoes", () => {
  it("mantem permissoes operacionais usadas pela aplicacao", () => {
    expect(permissoes).toEqual(
      expect.arrayContaining([
        "entradas",
        "transferencias",
        "despesas",
        "mercadorias",
        "retiradas",
        "fechamento_com_diferenca",
        "relatorio_produtos_mais_vendidos",
        "cadastro_permissoes"
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
