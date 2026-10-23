import { describe, expect, it } from "vitest";
import { respostaItemPublicaSchema } from "@padaria/shared/compras";

const conviteItemId = "6f1d1b0e-8f3a-4c5b-9a57-1d2f3a4b5c6d";

/**
 * R-221: item disponivel sem valor (ou com R$ 0,00) NAO e resposta valida. Custo zero entraria na
 * compra automatica (custo <= base) e compraria de graca, sem volta.
 */
describe("resposta do fornecedor por item", () => {
  it("aceita valor positivo", () => {
    expect(respostaItemPublicaSchema.safeParse({ conviteItemId, valorUnitario: 12.5 }).success).toBe(true);
  });

  it("recusa item disponivel sem valor ou com valor zero", () => {
    expect(respostaItemPublicaSchema.safeParse({ conviteItemId }).success).toBe(false);
    expect(respostaItemPublicaSchema.safeParse({ conviteItemId, valorUnitario: null }).success).toBe(false);
    expect(respostaItemPublicaSchema.safeParse({ conviteItemId, valorUnitario: 0 }).success).toBe(false);
  });

  it("item indisponivel nao leva valor", () => {
    expect(respostaItemPublicaSchema.safeParse({ conviteItemId, indisponivel: true }).success).toBe(true);
  });
});
