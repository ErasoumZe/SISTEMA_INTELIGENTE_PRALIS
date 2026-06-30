import { describe, expect, it } from "vitest";
import { deCentavos, formatarDecimalBanco, paraCentavos, somarCentavos } from "@padaria/shared/dinheiro";

describe("dinheiro", () => {
  it("preserva centavos sem depender de ponto flutuante", () => {
    expect(paraCentavos("10.10")).toBe(1010);
    expect(paraCentavos(0.29)).toBe(29);
    expect(somarCentavos("0.10", "0.20", 0.3)).toBe(60);
    expect(deCentavos(1234)).toBe(12.34);
    expect(formatarDecimalBanco("12,30")).toBe("12.30");
  });
});
