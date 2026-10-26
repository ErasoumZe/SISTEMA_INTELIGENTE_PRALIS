import { describe, expect, it } from "vitest";
import { questorExportacaoPreviaRequisicaoSchema } from "@padaria/shared/conplus";

describe("prévia de exportação Questor", () => {
  it("aceita apenas IDs de processo UUID e limita o lote", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(questorExportacaoPreviaRequisicaoSchema.parse({ processoIds: [id] })).toEqual({ processoIds: [id] });
    expect(() => questorExportacaoPreviaRequisicaoSchema.parse({ processoIds: ["nao-e-uuid"] })).toThrow();
    expect(() =>
      questorExportacaoPreviaRequisicaoSchema.parse({ processoIds: Array.from({ length: 51 }, () => id) })
    ).toThrow();
  });

  it("recusa campos enviados pelo navegador fora do contrato", () => {
    expect(() =>
      questorExportacaoPreviaRequisicaoSchema.parse({
        processoIds: ["11111111-1111-4111-8111-111111111111"],
        conteudo: "valor inventado"
      })
    ).toThrow();
  });
});
