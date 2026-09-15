import { parseNfe, type NfeParseada } from "../notas-fiscais/notas-fiscais.parser.js";
import type { NotaFiscalExtraida } from "./gemini-nota-fiscal.js";

function decimal(valor: string | null): string | null {
  if (valor === null || valor.trim() === "") return null;
  const normalizado = valor.replace(",", ".").trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalizado)) return null;
  const numero = Number(normalizado);
  if (!Number.isFinite(numero) || numero < 0) return null;
  return numero
    .toFixed(4)
    .replace(/\.0+$/, "")
    .replace(/(\.\d*?)0+$/, "$1");
}

function dataIso(valor: string | null): string | null {
  if (!valor) return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(valor.trim());
  return match?.[1] ?? null;
}

function textoOuNull(valor: string | null): string | null {
  const texto = valor?.trim() ?? "";
  return texto && !/^sem\s+gtin$/i.test(texto) ? texto : null;
}

/** Converte NF-e XML para o mesmo contrato usado pela leitura multimodal. */
export function extrairNotaFiscalDoXml(xml: string): NotaFiscalExtraida {
  let nfe: NfeParseada;
  try {
    nfe = parseNfe(xml);
  } catch {
    throw new Error("XML sem uma NF-e valida.");
  }
  if (!nfe.fornecedorCnpj && !nfe.fornecedorNome && !nfe.itens.length) {
    throw new Error("XML sem dados fiscais suficientes.");
  }

  const itens = nfe.itens.flatMap((item) => {
    const descricao = item.descricao?.trim() ?? "";
    if (!descricao) return [];
    const quantidade = decimal(item.quantidade);
    const valorUnitario = decimal(item.valorUnitario);
    const valorTotal = decimal(item.valorTotal);
    return [
      {
        codigo: textoOuNull(item.codigo),
        ean: textoOuNull(item.ean),
        descricao,
        quantidade,
        valorUnitario,
        desconto: decimal(item.desconto),
        valorTotal,
        confianca: 1,
        camposDuvidosos: [
          ...(quantidade === null ? ["quantidade"] : []),
          ...(valorUnitario === null ? ["valorUnitario"] : []),
          ...(valorTotal === null ? ["valorTotal"] : [])
        ]
      }
    ];
  });

  const chave = /^\d{44}$/.test(nfe.chave) ? nfe.chave : null;
  const valorProdutos = decimal(nfe.valorProdutos);
  const valorDesconto = decimal(nfe.valorDesconto);
  const valorFrete = decimal(nfe.valorFrete);
  const valorTotal = decimal(nfe.valorTotal);
  const somaItens = itens.reduce((soma, item) => soma + Number(item.valorTotal ?? 0), 0).toFixed(2);
  const totalCalculado = (
    Number(valorProdutos ?? somaItens) -
    Number(valorDesconto ?? 0) +
    Number(valorFrete ?? 0)
  ).toFixed(2);
  const avisos = [
    "Leitura feita diretamente do XML da NF-e; valores e identificadores não foram estimados pela IA.",
    "Tributos, transporte, duplicatas e informações adicionais ficam disponíveis no XML, mas não possuem campo equivalente neste modal."
  ];
  if (!nfe.itens.length) avisos.push("O XML não possui itens de produto para discriminação.");
  if (nfe.dataVencimento) avisos.push(`Primeiro vencimento encontrado no XML: ${nfe.dataVencimento}.`);

  return {
    documentoLegivel: true,
    fornecedorNome: nfe.fornecedorNome,
    fornecedorCnpj: nfe.fornecedorCnpj,
    numero: nfe.numero,
    serie: nfe.serie,
    dataEmissao: dataIso(nfe.dataEmissao),
    chaveAcesso: chave,
    itens,
    valorProdutos,
    valorDesconto,
    valorFrete,
    valorTotal,
    confiancas: { fornecedor: 1, numero: 1, serie: 1, dataEmissao: 1, chaveAcesso: chave ? 1 : 0, totais: 1 },
    camposDuvidosos: [
      ...(nfe.fornecedorCnpj ? [] : ["fornecedor.cnpj"]),
      ...(nfe.numero ? [] : ["numero"]),
      ...(nfe.dataEmissao ? [] : ["dataEmissao"]),
      ...(chave ? [] : ["chaveAcesso"])
    ],
    observacoes: [...avisos, `Conferência XML: soma dos itens ${somaItens}; total calculado ${totalCalculado}.`]
  };
}
