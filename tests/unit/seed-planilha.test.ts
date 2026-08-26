import { describe, expect, it } from "vitest";
import {
  chavesRepetidas,
  ehTotalizadorPlanilha,
  estoqueDaPlanilha,
  normalizarTextoPlanilha,
  numeroDaPlanilha,
  siglaDeUnidade
} from "../../scripts/seed-planilha-regras.js";

describe("seed da planilha", () => {
  it("descarta TOTAL mesmo com caixa diferente, espaços e caractere invisível", () => {
    expect(ehTotalizadorPlanilha("  total \u2060 despesas variáveis ")).toBe(true);
    expect(ehTotalizadorPlanilha("DES TOTAL DE IMPOSTOS")).toBe(false);
  });

  it("normaliza caracteres invisíveis antes de criar a chave natural", () => {
    expect(normalizarTextoPlanilha("DES \u2060 IMPOSTOS   -  FEDERAL")).toBe("DES IMPOSTOS - FEDERAL");
  });
});

describe("seed da planilha — produtos (P-04, ETAPA 5)", () => {
  it("numeroDaPlanilha distingue vazio de zero e entende o formato pt-BR", () => {
    expect(numeroDaPlanilha("1.234,5")).toBe(1234.5);
    expect(numeroDaPlanilha("0")).toBe(0);
    expect(numeroDaPlanilha("")).toBeNull();
    expect(numeroDaPlanilha(undefined)).toBeNull();
    expect(numeroDaPlanilha("nao e numero")).toBeNull();
  });

  it("siglaDeUnidade normaliza caixa e espacos", () => {
    expect(siglaDeUnidade(" kg ")).toBe("KG");
    expect(siglaDeUnidade("Un")).toBe("UN");
    expect(siglaDeUnidade("")).toBe("");
  });

  it("estoqueDaPlanilha MARCA o inverso em vez de corrigir em silencio", () => {
    // Trocar os dois esconderia um erro de digitacao — e o pedido automatico dispararia errado.
    expect(estoqueDaPlanilha("10", "5")).toEqual({ minimo: 10, maximo: 5, invertido: true });
    expect(estoqueDaPlanilha("5", "10")).toEqual({ minimo: 5, maximo: 10, invertido: false });
    expect(estoqueDaPlanilha("5", "5")).toEqual({ minimo: 5, maximo: 5, invertido: false });
  });

  it("estoqueDaPlanilha nao acusa inversao quando falta um dos dois", () => {
    expect(estoqueDaPlanilha("", "10")).toEqual({ minimo: null, maximo: 10, invertido: false });
    expect(estoqueDaPlanilha("10", "")).toEqual({ minimo: 10, maximo: null, invertido: false });
  });

  it("chavesRepetidas devolve so o que repete, ignorando vazio", () => {
    const itens = [{ ean: "789" }, { ean: "789" }, { ean: "111" }, { ean: "" }, { ean: "" }];
    const repetidos = chavesRepetidas(itens, (item) => item.ean);
    expect([...repetidos]).toEqual([["789", 2]]);
  });
});
