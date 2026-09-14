import { describe, expect, it } from "vitest";
import { analiseNotaFiscalIaSchema } from "@padaria/shared";
import { formOperacaoVazio } from "./domain";
import { aplicarAnaliseNotaFiscal } from "./discriminacao-ia";
import { itemDespesaVazio, itemMercadoriaVazio } from "./operacoes";

const analise = analiseNotaFiscalIaSchema.parse({
  documentoLegivel: true,
  fornecedor: {
    nome: "Fornecedor",
    cnpj: "12345678000190",
    fornecedorId: "a6bc9d1d-981a-4ca4-a41f-5544b52bb301",
    cadastrado: true,
    confianca: 0.98,
    duvidoso: false
  },
  numero: "362",
  serie: "002",
  dataEmissao: "2021-11-08",
  chaveNfeIdentificada: true,
  chaveNfeFinal: "2164",
  itens: [
    {
      descricao: "Produto",
      codigo: null,
      ean: null,
      quantidade: "1",
      valorUnitario: "1299.9",
      desconto: "0",
      valorTotal: "1299.9",
      produtoId: null,
      grupoMercadoriaId: null,
      unidadeMedidaId: null,
      cadastrado: false,
      confianca: 0.97,
      camposDuvidosos: []
    }
  ],
  valorProdutos: "1299.9",
  valorDesconto: "10",
  valorFrete: "25",
  valorTotal: "1314.9",
  camposDuvidosos: [],
  validacoes: {
    somaItens: "1299.90",
    somaItensConfere: true,
    totalCalculado: "1314.90",
    valorTotalConfere: true,
    possivelDuplicata: false,
    motivoDuplicidade: null
  },
  avisos: []
});

describe("aplicacao nao destrutiva da leitura por IA", () => {
  it("preenche campos vazios e a linha vazia de mercadoria sem aplicar frete em Juros", () => {
    const form = formOperacaoVazio();
    const itens = [itemMercadoriaVazio()];
    aplicarAnaliseNotaFiscal("mercadoria", analise, form, [itemDespesaVazio()], itens);
    expect(form.fornecedorId).toBe(analise.fornecedor.fornecedorId);
    expect(form.numeroDocumentoFiscal).toBe("362");
    expect(form.dataDocumentoFiscal).toBe("2021-11-08");
    expect(form.valorOriginal).toBe("1299.9");
    expect(form.valorAcrescimo).toBe("");
    expect(form.jurosValorInformado).toBe("");
    expect(form.descontoGeralValor).toBe("10");
    expect(itens).toHaveLength(1);
    expect(itens[0]?.descricao).toBe("Produto");
  });

  it("preserva valores manuais e acrescenta sugestoes sem apagar linhas existentes", () => {
    const form = formOperacaoVazio();
    form.fornecedorId = "fornecedor-manual";
    form.numeroDocumentoFiscal = "manual";
    form.valorOriginal = "500";
    const itens = [{ ...itemMercadoriaVazio(), descricao: "Digitado", valorUnitario: "500" }];
    aplicarAnaliseNotaFiscal("mercadoria", analise, form, [itemDespesaVazio()], itens);
    expect(form.fornecedorId).toBe("fornecedor-manual");
    expect(form.numeroDocumentoFiscal).toBe("manual");
    expect(form.valorOriginal).toBe("500");
    expect(itens.map((item) => item.descricao)).toEqual(["Digitado", "Produto"]);
  });

  it("mantem itens de despesa pendentes de vinculo para revisao humana", () => {
    const form = formOperacaoVazio();
    const itens = [itemDespesaVazio()];
    aplicarAnaliseNotaFiscal("despesa", analise, form, itens, [itemMercadoriaVazio()]);
    expect(itens[0]).toMatchObject({ descricao: "Produto", patrimonioItemId: "", colaboradorId: "" });
  });
});
