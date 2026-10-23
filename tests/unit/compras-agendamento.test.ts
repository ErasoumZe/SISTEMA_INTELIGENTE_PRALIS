import { describe, expect, it } from "vitest";
import { agendamentoPayloadSchema, topoDoRanking } from "@padaria/shared/compras";

// Agendamento de pedido (PROJECT_BRAIN/56 e 58): as bolinhas e o contrato (so produtos, sem quantidade).
describe("bolinhas: top 20% de cada ranking", () => {
  it("pega o primeiro quinto (arredondado para cima) dos que tem medida positiva", () => {
    const medidas = new Map(Object.entries({ a: 50, b: 40, c: 30, d: 20, e: 10, f: 5, g: 0, h: -3 }));
    // 6 positivos -> ceil(1,2) = 2.
    expect([...topoDoRanking(medidas)].sort()).toEqual(["a", "b"]);
  });

  it("empate na fronteira entra (nao corta produto igual ao ultimo do topo)", () => {
    const medidas = new Map(Object.entries({ a: 10, b: 7, c: 7, d: 1, e: 1 }));
    expect([...topoDoRanking(medidas)].sort()).toEqual(["a"]);
    const empate = new Map(Object.entries({ a: 9, b: 9, c: 1, d: 1, e: 1, f: 1, g: 1, h: 1, i: 1, j: 1 }));
    expect([...topoDoRanking(empate)].sort()).toEqual(["a", "b"]);
  });

  it("sem venda, compra ou lucro positivo, ninguem ganha bolinha", () => {
    expect(topoDoRanking(new Map(Object.entries({ a: 0, b: -1 })))).toEqual(new Set());
  });
});

describe("contrato do agendamento", () => {
  const base = {
    empresaId: "11111111-1111-4111-8111-111111111111",
    grupoMercadoriaId: "11111111-1111-4111-8111-111111111112",
    inicioData: "2026-11-02",
    inicioHora: "08:00",
    regra: { tipo: "padrao", frequencia: "semanal", intervalo: 1, diasSemana: [1, 4] },
    termino: { tipo: "nunca" },
    prazoRespostaHoras: 12,
    produtos: [{ produtoId: "11111111-1111-4111-8111-111111111113" }]
  };
  it("aceita o pedido de bebidas duas vezes por semana", () => {
    expect(agendamentoPayloadSchema.safeParse(base).success).toBe(true);
  });
  it("recusa hora invalida, prazo fora de 1-720 h e produto repetido", () => {
    expect(agendamentoPayloadSchema.safeParse({ ...base, inicioHora: "24:00" }).success).toBe(false);
    expect(agendamentoPayloadSchema.safeParse({ ...base, prazoRespostaHoras: 0 }).success).toBe(false);
    expect(
      agendamentoPayloadSchema.safeParse({ ...base, produtos: [base.produtos[0], base.produtos[0]] }).success
    ).toBe(false);
  });
  it("o agendamento nao guarda quantidade: ela e posta na Solicitacao de compra (doc 58 §2)", () => {
    const lido = agendamentoPayloadSchema.parse({
      ...base,
      produtos: [{ produtoId: base.produtos[0]!.produtoId, quantidadePadrao: 6 }]
    });
    expect(lido.produtos).toEqual([{ produtoId: base.produtos[0]!.produtoId }]);
  });
});
