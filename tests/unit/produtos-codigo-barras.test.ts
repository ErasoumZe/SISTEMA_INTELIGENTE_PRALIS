import { describe, expect, it } from "vitest";
import { variantesDeCodigoDeBarras } from "@padaria/shared/produtos";

// Casos do `barcodeCandidates` do app oficial (tax-rule.service.test.ts): mesma entrada, mesmo resultado.
describe("variantesDeCodigoDeBarras (barcodeCandidates do oficial)", () => {
  it("EAN de balanca vira tambem o PLU que a etiqueta carrega", () => {
    expect(variantesDeCodigoDeBarras("2128050024901")).toEqual(["2128050024901", "12805"]);
  });

  it("tira os zeros a esquerda e o que nao e digito", () => {
    expect(variantesDeCodigoDeBarras("0000789")).toEqual(["789"]);
    expect(variantesDeCodigoDeBarras(" 789-1234 ")).toEqual(["7891234"]);
    expect(variantesDeCodigoDeBarras("0000")).toEqual(["0"]);
  });

  it("EAN comum de 13 digitos nao ganha PLU; texto sem digito nao gera variante", () => {
    expect(variantesDeCodigoDeBarras("7891234567890")).toEqual(["7891234567890"]);
    expect(variantesDeCodigoDeBarras("leite")).toEqual([]);
    expect(variantesDeCodigoDeBarras(null)).toEqual([]);
  });
});
