import { describe, expect, it } from "vitest";
import { ajusteSaldoSchema, resumoCaixaQuerySchema } from "../../shared/src/caixa/index.js";

describe("caixa shared contracts", () => {
  it("normaliza valor de diferenca recebido como texto", () => {
    const payload = ajusteSaldoSchema.parse({
      empresaId: "11111111-1111-4111-8111-111111111111",
      colaboradorId: "22222222-2222-4222-8222-222222222222",
      data: "2026-06-10",
      valorDiferenca: "-15.75"
    });

    expect(payload.valorDiferenca).toBe(-15.75);
  });

  it("exige empresa e data para resumo do caixa", () => {
    expect(() => resumoCaixaQuerySchema.parse({ data: "2026-06-10" })).toThrow();
  });
});

