import { describe, expect, it } from "vitest";
import { ehTotalizadorPlanilha, normalizarTextoPlanilha } from "../../scripts/seed-planilha-regras.js";

describe("seed da planilha", () => {
  it("descarta TOTAL mesmo com caixa diferente, espaços e caractere invisível", () => {
    expect(ehTotalizadorPlanilha("  total \u2060 despesas variáveis ")).toBe(true);
    expect(ehTotalizadorPlanilha("DES TOTAL DE IMPOSTOS")).toBe(false);
  });

  it("normaliza caracteres invisíveis antes de criar a chave natural", () => {
    expect(normalizarTextoPlanilha("DES \u2060 IMPOSTOS   -  FEDERAL")).toBe("DES IMPOSTOS - FEDERAL");
  });
});
