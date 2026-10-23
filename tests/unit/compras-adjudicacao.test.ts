import { describe, expect, it } from "vitest";
import { calcularCustoFinal, type ItemParaCusto } from "@padaria/shared/compras";

/**
 * Fase 2 — nucleo de dinheiro da compra automatica (decisoes 1/5/12). Cada caso diz a conta, para
 * quem ler discordar da REGRA, nao so do resultado.
 */
describe("calcularCustoFinal", () => {
  it("sem frete, custo final = valor unitario; compra automatica quando <= base", () => {
    const itens: ItemParaCusto[] = [
      { ref: "a", valorUnitario: 4.5, quantidade: 2, precoBaseValor: 5 }, // 4.5 <= 5 -> compra
      { ref: "b", valorUnitario: 6, quantidade: 1, precoBaseValor: 5 }, // 6 > 5 -> comprador
      { ref: "c", valorUnitario: 3, quantidade: 1, precoBaseValor: null } // sem base -> comprador
    ];
    const resultado = calcularCustoFinal(itens, 0);
    expect(resultado.map((r) => r.custoFinalUnitario)).toEqual([4.5, 6, 3]);
    expect(resultado.map((r) => r.compraAutomatica)).toEqual([true, false, false]);
    expect(resultado.every((r) => r.freteRateado === 0)).toBe(true);
  });

  it("rateia o frete pelo valor total de cada item (maior resto, soma exata) e soma ao custo", () => {
    // Item a: 10,00 x 2 = 20,00 (peso 2000). Item b: 10,00 x 1 = 10,00 (peso 1000). Frete 3,00.
    // Fatias 3,00 * 2000/3000 = 2,00 e 1,00. Por unidade: a = 2,00/2 = 1,00; b = 1,00/1 = 1,00.
    const itens: ItemParaCusto[] = [
      { ref: "a", valorUnitario: 10, quantidade: 2, precoBaseValor: 12 },
      { ref: "b", valorUnitario: 10, quantidade: 1, precoBaseValor: 10.5 }
    ];
    const resultado = calcularCustoFinal(itens, 3);
    expect(resultado[0]).toMatchObject({ freteRateado: 2, custoFinalUnitario: 11 });
    expect(resultado[1]).toMatchObject({ freteRateado: 1, custoFinalUnitario: 11 });
    // a: 11 <= 12 -> compra; b: 11 > 10,5 -> comprador.
    expect(resultado.map((r) => r.compraAutomatica)).toEqual([true, false]);
  });

  it("frete de centavo impar vai inteiro para o item de maior peso (soma exata)", () => {
    const itens: ItemParaCusto[] = [
      { ref: "a", valorUnitario: 10, quantidade: 1, precoBaseValor: null },
      { ref: "b", valorUnitario: 20, quantidade: 1, precoBaseValor: null }
    ];
    const resultado = calcularCustoFinal(itens, 0.01);
    const somaFrete = resultado.reduce((soma, r) => soma + r.freteRateado, 0);
    expect(Number(somaFrete.toFixed(2))).toBe(0.01);
    // Maior peso (b) leva o centavo.
    expect(resultado[1]?.freteRateado).toBe(0.01);
    expect(resultado[0]?.freteRateado).toBe(0);
  });
});
