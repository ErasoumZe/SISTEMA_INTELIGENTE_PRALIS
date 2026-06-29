import { describe, expect, it } from "vitest";
import { despesaPayloadSchema } from "../../shared/src/despesas/index.js";
import { mercadoriaPayloadSchema } from "../../shared/src/mercadorias/index.js";
import { retiradaPayloadSchema } from "../../shared/src/retiradas/index.js";
import { transferenciaPayloadSchema } from "../../shared/src/transferencias/index.js";
import { vendaPayloadSchema, vendasQuerySchema } from "../../shared/src/vendas/index.js";

const empresaId = "11111111-1111-4111-8111-111111111111";
const uuid = "22222222-2222-4222-8222-222222222222";

describe("contratos operacionais por entidade", () => {
  it("valida venda sem campo tipo e com detalhes padrao", () => {
    const payload = vendaPayloadSchema.parse({
      empresaId,
      dataReferencia: "2026-06-29",
      descricao: "Venda balcão",
      valorOriginal: 10
    });

    expect(payload).toMatchObject({
      empresaId,
      valorAcrescimo: 0,
      valorDesconto: 0,
      computar: true,
      itensVenda: [],
      tiposPagamento: []
    });
    expect("tipo" in payload).toBe(false);
  });

  it("valida despesa com itens discriminados", () => {
    const payload = despesaPayloadSchema.parse({
      empresaId,
      dataReferencia: "2026-06-29",
      dataVencimento: "2026-06-30",
      descricao: "Manutenção",
      valorOriginal: 12,
      itensDespesa: [{ descricao: "Peça", valor: 12 }]
    });

    expect(payload.itensDespesa).toHaveLength(1);
  });

  it("valida mercadoria, retirada e transferencia com contratos proprios", () => {
    expect(
      mercadoriaPayloadSchema.parse({
        empresaId,
        fornecedorId: uuid,
        dataReferencia: "2026-06-29",
        dataVencimento: "2026-06-30",
        descricao: "Farinha",
        valorOriginal: 20,
        grupoMercadoriaId: uuid
      })
    ).toMatchObject({ fornecedorId: uuid });

    expect(
      retiradaPayloadSchema.parse({
        empresaId,
        colaboradorId: uuid,
        dataReferencia: "2026-06-29",
        dataVencimento: "2026-06-29",
        descricao: "Vale",
        valorOriginal: 5
      })
    ).toMatchObject({ colaboradorId: uuid });

    expect(
      transferenciaPayloadSchema.parse({
        empresaId,
        contaOrigemId: uuid,
        contaDestinoId: "33333333-3333-4333-8333-333333333333",
        dataReferencia: "2026-06-29",
        descricao: "Banco",
        valorOriginal: 15
      })
    ).toMatchObject({ contaOrigemId: uuid });
  });

  it("rejeita filtro de tipo na listagem de vendas", () => {
    expect(() => vendasQuerySchema.strict().parse({ tipo: "entrada" })).toThrow();
  });
});
