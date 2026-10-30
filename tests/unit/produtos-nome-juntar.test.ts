import { describe, expect, it } from "vitest";
import { nomeParaJuntar } from "../../api/src/produtos/produtos-nome-juntar.js";

/**
 * Fase B2, juntar (30/10/2026): so entra na juncao o produto antigo do PDV que e o MESMO da linha do backup.
 * Casos tirados da previa de producao.
 */
describe("nome para juntar produtos antigos do PDV", () => {
  const mesmo = (a: string, b: string) => nomeParaJuntar(a) === nomeParaJuntar(b);

  it("ignora acento, pontuacao e o sufixo de unidade", () => {
    expect(mesmo("PEITO DE PERU SADIA KG VENDA", "PEITO DE PERU SADIA KG VENDA KG")).toBe(true);
    expect(mesmo("BISCOITO AMANTEIGADOS NATA MAGIA KG", "BISCOITO AMANTEIGADOS NATA MAGIA KG KG")).toBe(true);
    expect(mesmo("PROMOÇÃO BANDEJA DE PUDIM", "PROMOCAO BANDEJA DE PUDIM 1 UN")).toBe(true);
    expect(mesmo("PÃO C/QUEIJO MINAS E  MUSSARELA E FRANGO", "PAO C/QUEIJO MINAS E MUSSARELA E FRANGO UN")).toBe(true);
  });

  it("nao junta outro sabor nem a caixa", () => {
    expect(mesmo("ICE TEA LEAO LIMÃO 1500ML", "ICE TEA LEAO PESSEGO 1500ML")).toBe(false);
    expect(mesmo("COCA COLA 1L", "COCA COLA PET 1L CX C/06")).toBe(false);
  });

  it("nao apaga o nome inteiro", () => {
    expect(nomeParaJuntar("UN")).toBe("UN");
  });
});
