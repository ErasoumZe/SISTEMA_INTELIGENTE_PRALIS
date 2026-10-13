import { describe, expect, it } from "vitest";
import { normalizarTotaisRelatorioVendas } from "../../web-vue/utils/caixa-fechamento.js";

describe("contrato do relatorio de vendas do fechamento", () => {
  const formas = [
    { formaPagamento: "Dinheiro", categoriaFechamentoCaixa: "dinheiro" as const, total: 50, quantidade: 1 }
  ];

  it("usa totalGeral nos relatorios novos", () => {
    expect(
      normalizarTotaisRelatorioVendas({ totalGeral: 136, quantidade: 5, porFormaPagamento: formas }).totalGeral
    ).toBe(136);
  });

  it("mantem legivel o snapshot historico salvo com total", () => {
    expect(normalizarTotaisRelatorioVendas({ total: 136, quantidade: 5, porFormaPagamento: formas }).totalGeral).toBe(
      136
    );
  });
});
