import { describe, expect, it } from "vitest";
import { fecharCaixaPayloadSchema } from "@padaria/shared/caixa";

describe("contrato de lacre de fechamento do caixa", () => {
  it("recusa fechamento sem o lacre físico", () => {
    expect(fecharCaixaPayloadSchema.safeParse({ observacao: "Turno encerrado" }).success).toBe(false);
  });

  it("exige o lacre de fechamento, mas mantém retorno opcional", () => {
    expect(
      fecharCaixaPayloadSchema.parse({
        lacreFechamento: "FCH-001"
      })
    ).toEqual({
      lacreFechamento: "FCH-001"
    });
  });
});
