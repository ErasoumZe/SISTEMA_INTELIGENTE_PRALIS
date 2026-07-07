import { describe, expect, it } from "vitest";
import { formOperacaoVazio } from "./domain";
import { formOperacaoDeDetalhe, montarPayloadOperacao, type OperacaoDetalhe } from "./operacoes";

const detalheBase: OperacaoDetalhe = {
  id: "op-1",
  dataReferencia: "2026-07-03",
  descricao: "Lancamento",
  valorOriginal: 20,
  valorAcrescimo: 0,
  valorDesconto: 0,
  computar: true
};

describe("formOperacaoDeDetalhe", () => {
  it("mapeia venda com itens e pagamentos para strings do formulario", () => {
    const preenchido = formOperacaoDeDetalhe("venda", {
      ...detalheBase,
      valorOriginal: 12.5,
      itensVenda: [{ produtoId: "p1", descricaoProduto: "Pao", quantidade: 2, valorUnitario: 6.25, valorTotal: 12.5 }],
      tiposPagamento: [{ formaPagamentoId: "f1", numeroVendas: 1, totalPago: 12.5 }]
    });
    expect(preenchido.form.valorOriginal).toBe("12.5");
    expect(preenchido.itensVenda).toEqual([
      { descricaoProduto: "Pao", quantidade: "2", valorUnitario: "6.25", valorTotal: "12.5", produtoId: "p1" }
    ]);
    expect(preenchido.tiposPagamento).toEqual([{ formaPagamentoId: "f1", totalPago: "12.5", numeroVendas: "1" }]);
    expect(preenchido.discriminandoDespesa).toBe(false);
  });

  it("liga discriminandoDespesa quando a despesa tem itens", () => {
    const preenchido = formOperacaoDeDetalhe("despesa", {
      ...detalheBase,
      itensDespesa: [{ grupoDespesaId: "g1", descricao: "Item", valor: 5 }]
    });
    expect(preenchido.discriminandoDespesa).toBe(true);
    expect(preenchido.itensDespesa).toEqual([{ descricao: "Item", valor: "5", grupoDespesaId: "g1" }]);
    expect(preenchido.itensVenda).toBeUndefined();
  });

  it("so inclui dataVencimento quando o detalhe traz", () => {
    expect(formOperacaoDeDetalhe("retirada", detalheBase).form).not.toHaveProperty("dataVencimento");
    expect(
      formOperacaoDeDetalhe("retirada", { ...detalheBase, dataVencimento: "2026-07-10" }).form.dataVencimento
    ).toBe("2026-07-10");
  });

  it("normaliza nulos do detalhe para strings vazias", () => {
    const preenchido = formOperacaoDeDetalhe("despesa", { ...detalheBase, contaOrigemId: null, fornecedorId: null });
    expect(preenchido.form.contaOrigemId).toBe("");
    expect(preenchido.form.fornecedorId).toBe("");
  });
});

describe("montarPayloadOperacao", () => {
  const base = {
    empresaId: "e1",
    itensVenda: [],
    tiposPagamento: [],
    itensDespesa: [],
    itensMercadoria: [],
    discriminandoDespesa: false,
    discriminandoMercadoria: false,
    produtos: [] as Array<{ id: string; descricao?: string | null; nome?: string | null }>
  };

  it("converte valores monetarios em centavos e normaliza vazios para null", () => {
    const form = {
      ...formOperacaoVazio(),
      valorOriginal: "10,50",
      valorAcrescimo: "",
      valorDesconto: "",
      maloteId: ""
    };
    const payload = montarPayloadOperacao("retirada", { ...base, form });
    expect(payload.empresaId).toBe("e1");
    expect(payload.valorOriginal).toBe(10.5);
    expect(payload.valorAcrescimo).toBe(0);
    expect(payload.maloteId).toBeNull();
    expect(payload.dataPagamento).toBeNull();
  });

  it("monta itens de venda com fallback de descricao pelo produto e centavos", () => {
    const form = { ...formOperacaoVazio(), valorOriginal: "12" };
    const payload = montarPayloadOperacao("venda", {
      ...base,
      form,
      itensVenda: [{ descricaoProduto: "", quantidade: "1", valorUnitario: "12", valorTotal: "12", produtoId: "p1" }],
      tiposPagamento: [{ formaPagamentoId: "f1", totalPago: "12", numeroVendas: "1" }],
      produtos: [{ id: "p1", descricao: "Pao Frances", nome: null }]
    });
    expect(payload.itensVenda).toEqual([
      { produtoId: "p1", descricaoProduto: "Pao Frances", quantidade: 1, valorUnitario: 12, valorTotal: 12 }
    ]);
    expect(payload.tiposPagamento).toEqual([{ formaPagamentoId: "f1", numeroVendas: 1, totalPago: 12 }]);
  });

  it("so inclui itens de despesa quando discriminando", () => {
    const form = { ...formOperacaoVazio(), valorOriginal: "5" };
    const itensDespesa = [{ descricao: "Item", valor: "5", grupoDespesaId: "g1" }];
    expect(montarPayloadOperacao("despesa", { ...base, form, itensDespesa }).itensDespesa).toEqual([]);
    expect(
      montarPayloadOperacao("despesa", { ...base, form, itensDespesa, discriminandoDespesa: true }).itensDespesa
    ).toEqual([{ descricao: "Item", valor: 5, grupoDespesaId: "g1" }]);
  });
});
