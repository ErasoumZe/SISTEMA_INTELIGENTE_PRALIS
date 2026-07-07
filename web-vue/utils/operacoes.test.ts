import { describe, expect, it } from "vitest";
import { formOperacaoVazio } from "./domain";
import {
  formOperacaoDeDetalhe,
  montarPayloadOperacao,
  validarOperacaoParaEnvio,
  type OperacaoDetalhe
} from "./operacoes";

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

  it("todo ID opcional em branco vira null, nao '' (o bug 'colaboradorId: Invalid UUID')", () => {
    // Form vazio: todos os IDs sao "" por padrao. O schema zod rejeita "" em campos uuid.
    const payload = montarPayloadOperacao("despesa", { ...base, form: { ...formOperacaoVazio() } });
    expect(payload.colaboradorId).toBeNull();
    expect(payload.contaOrigemId).toBeNull();
    expect(payload.contaDestinoId).toBeNull();
    expect(payload.fornecedorId).toBeNull();
    expect(payload.grupoDespesaId).toBeNull();
    expect(payload.grupoMercadoriaId).toBeNull();
    expect(payload.grupoRetiradaId).toBeNull();
    expect(payload.maloteId).toBeNull();
    // IDs preenchidos passam intactos.
    const preenchido = montarPayloadOperacao("despesa", {
      ...base,
      form: { ...formOperacaoVazio(), contaOrigemId: "c1", grupoDespesaId: "g1" }
    });
    expect(preenchido.contaOrigemId).toBe("c1");
    expect(preenchido.grupoDespesaId).toBe("g1");
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

describe("validarOperacaoParaEnvio", () => {
  const ok = {
    descricao: "Compra de farinha",
    grupoDespesaId: "g1",
    grupoMercadoriaId: "gm1",
    contaOrigemId: "c1",
    contaDestinoId: "c2",
    fornecedorId: "f1",
    colaboradorId: "col1",
    qtdItensDespesa: 0,
    qtdItensMercadoria: 0
  };

  it("exige descricao em qualquer operacao", () => {
    expect(validarOperacaoParaEnvio("despesa", { ...ok, descricao: "   " })).toMatch(/descricao/i);
    expect(validarOperacaoParaEnvio("venda", { ...ok, descricao: "" })).toMatch(/descricao/i);
  });

  it("despesa: exige grupo OU itens discriminados (o bug relatado)", () => {
    expect(validarOperacaoParaEnvio("despesa", { ...ok, grupoDespesaId: "" })).toMatch(/grupo da despesa/i);
    expect(validarOperacaoParaEnvio("despesa", ok)).toBeNull();
    expect(validarOperacaoParaEnvio("despesa", { ...ok, grupoDespesaId: "", qtdItensDespesa: 2 })).toBeNull();
  });

  it("mercadoria: exige fornecedor E (grupo OU itens)", () => {
    expect(validarOperacaoParaEnvio("mercadoria", { ...ok, fornecedorId: "" })).toMatch(/fornecedor/i);
    expect(validarOperacaoParaEnvio("mercadoria", { ...ok, grupoMercadoriaId: "" })).toMatch(/grupo da mercadoria/i);
    expect(validarOperacaoParaEnvio("mercadoria", { ...ok, grupoMercadoriaId: "", qtdItensMercadoria: 1 })).toBeNull();
    expect(validarOperacaoParaEnvio("mercadoria", ok)).toBeNull();
  });

  it("retirada: exige colaborador", () => {
    expect(validarOperacaoParaEnvio("retirada", { ...ok, colaboradorId: "" })).toMatch(/colaborador/i);
    expect(validarOperacaoParaEnvio("retirada", ok)).toBeNull();
  });

  it("transferencia: exige conta origem, conta destino e que sejam diferentes", () => {
    expect(validarOperacaoParaEnvio("transferencia", { ...ok, contaOrigemId: "" })).toMatch(/conta de origem/i);
    expect(validarOperacaoParaEnvio("transferencia", { ...ok, contaDestinoId: "" })).toMatch(/conta de destino/i);
    expect(validarOperacaoParaEnvio("transferencia", { ...ok, contaDestinoId: "c1" })).toMatch(/diferente/i);
    expect(validarOperacaoParaEnvio("transferencia", ok)).toBeNull();
  });

  it("aceita IDs nulos (campos opcionais em branco) sem quebrar", () => {
    expect(validarOperacaoParaEnvio("venda", { ...ok, grupoDespesaId: null, contaOrigemId: null })).toBeNull();
  });
});
