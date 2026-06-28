import { describe, expect, it } from "vitest";
import { movimentacaoPayloadSchema, movimentacaoQuerySchema } from "../../shared/src/movimentacao/index.js";

describe("movimentacao shared contracts", () => {
  it("normaliza defaults do payload de movimentacao", () => {
    const payload = movimentacaoPayloadSchema.parse({
      empresaId: "11111111-1111-4111-8111-111111111111",
      tipo: "entrada",
      dataReferencia: "2026-06-10",
      dataVencimento: "2026-06-10",
      descricao: "Venda PDV",
      valorOriginal: "10.50"
    });

    expect(payload).toMatchObject({
      valorOriginal: 10.5,
      valorAcrescimo: 0,
      valorDesconto: 0,
      temNotaFiscal: false,
      computar: true,
      itensDespesa: [],
      itensMercadoria: []
    });
  });

  it("rejeita tipo de movimentacao fora do contrato", () => {
    expect(() =>
      movimentacaoQuerySchema.parse({
        tipo: "bonificacao"
      })
    ).toThrow();
  });
});
