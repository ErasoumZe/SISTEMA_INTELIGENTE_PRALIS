import type { AnaliseNotaFiscalIa } from "@padaria/shared";
import type { OperacaoForm } from "../types/padaria";
import { itemDespesaVazio, itemMercadoriaVazio, type ItemDespesaForm, type ItemMercadoriaForm } from "./operacoes";

function vazio(valor: string | null | undefined) {
  return !valor || Number(valor) === 0;
}

function linhaDespesaVazia(item: ItemDespesaForm) {
  return !item.descricao && !item.patrimonioItemId && !item.colaboradorId && vazio(item.valorUnitario);
}

function linhaMercadoriaVazia(item: ItemMercadoriaForm) {
  return !item.descricao && !item.produtoId && vazio(item.valorUnitario);
}

export function aplicarAnaliseNotaFiscal(
  categoria: "despesa" | "mercadoria",
  analise: AnaliseNotaFiscalIa,
  form: OperacaoForm,
  itensDespesa: ItemDespesaForm[],
  itensMercadoria: ItemMercadoriaForm[]
): string[] {
  const alterados: string[] = [];
  if (!form.fornecedorId && analise.fornecedor.fornecedorId) {
    form.fornecedorId = analise.fornecedor.fornecedorId;
    form.credorTipo = "fornecedor";
    alterados.push("fornecedor");
  }
  if (!form.numeroDocumentoFiscal && analise.numero) {
    form.numeroDocumentoFiscal = analise.numero;
    alterados.push("numero da nota");
  }
  if (!form.dataDocumentoFiscal && analise.dataEmissao) {
    form.dataDocumentoFiscal = analise.dataEmissao;
    alterados.push("data de emissao");
  }
  const bruto = analise.valorProdutos ?? analise.validacoes.somaItens;
  if (vazio(form.valorOriginal) && Number(bruto) > 0) {
    form.valorOriginal = bruto;
    alterados.push("valor dos produtos");
  }
  if (vazio(form.descontoGeralValor) && analise.valorDesconto && Number(analise.valorDesconto) > 0) {
    form.descontoGeralTipo = "valor";
    form.descontoGeralValor = analise.valorDesconto;
    alterados.push("desconto geral");
  }

  const itensValidos = analise.itens.filter(
    (item) => item.descricao && Number(item.quantidade ?? 0) > 0 && Number(item.valorUnitario ?? 0) >= 0
  );
  if (categoria === "mercadoria" && itensValidos.length) {
    const novos = itensValidos.map((item) => ({
      ...itemMercadoriaVazio(),
      descricao: item.descricao,
      quantidade: item.quantidade ?? "1",
      valorUnitario: item.valorUnitario ?? "0",
      valorTotal: item.valorTotal ?? "",
      produtoId: item.produtoId ?? "",
      grupoMercadoriaId: item.grupoMercadoriaId ?? "",
      unidadeMedidaId: item.unidadeMedidaId ?? ""
    }));
    if (itensMercadoria.length === 1 && itensMercadoria[0] && linhaMercadoriaVazia(itensMercadoria[0])) {
      itensMercadoria.splice(0, 1, ...novos);
    } else {
      itensMercadoria.push(...novos);
    }
    alterados.push(`${novos.length} item(ns)`);
  }
  if (categoria === "despesa" && itensValidos.length) {
    const novos = itensValidos.map((item) => ({
      ...itemDespesaVazio(),
      descricao: item.descricao,
      quantidade: item.quantidade ?? "1",
      valorUnitario: item.valorUnitario ?? "0"
    }));
    if (itensDespesa.length === 1 && itensDespesa[0] && linhaDespesaVazia(itensDespesa[0])) {
      itensDespesa.splice(0, 1, ...novos);
    } else {
      itensDespesa.push(...novos);
    }
    alterados.push(`${novos.length} item(ns) para relacionar`);
  }
  return alterados;
}
