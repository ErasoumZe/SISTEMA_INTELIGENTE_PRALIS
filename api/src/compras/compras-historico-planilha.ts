import { createHash } from "node:crypto";
import { abrirPlanilhaBuffer, ErroPlanilha } from "@padaria/db/planilha-xlsx";
import {
  LIMITE_LINHAS_HISTORICO,
  dataDaPlanilha,
  fornecedorDaReferencia,
  normalizarNomeHistorico,
  numeroDaPlanilha,
  type HistoricoLinha,
  type OrigemNumero
} from "@padaria/shared/compras";
import { erroValidacao } from "../erros.js";

// R-222: leitor da planilha de discriminacao (XLSX de uma aba ou CSV). Entrega `HistoricoLinha[]` cru;
// quem decide o que e valido e o servico de analise. Nada aqui toca o banco.

const CABECALHOS = {
  produto: new Set(["PRODUTOS", "PRODUTO", "PRODUDOS", "DESCRICAO", "DESCRICAO DO PRODUTO"]),
  fornecedor: new Set(["FORNECEDOR"]),
  referencia: new Set(["REFERENCIA"]),
  quantidade: new Set(["QUANT", "QUANTIDADE", "QTD"]),
  custo: new Set(["VALOR CUSTO UN", "CUSTO UN", "CUSTO UNITARIO", "CUSTO EMB", "VALOR UNITARIO"]),
  data: new Set(["DATA REF", "DATA", "DATA COMPRA", "DATA DA COMPRA"]),
  confrontar: new Set(["CONFRONTAR"])
};

// So o cabecalho mais proximo do topo vale: a planilha tem blocos de totais e legendas acima dos dados.
const LINHAS_PROCURANDO_CABECALHO = 40;
// Folga sobre o teto do contrato: o leitor para de ler estourado, e o erro dirigido sai do contrato.
const LINHAS_DE_FOLGA = 200;

function indice(cabecalho: string[], nomes: Set<string>): number {
  return cabecalho.findIndex((celula) => nomes.has(normalizarNomeHistorico(celula)));
}

type Colunas = {
  produto: number;
  fornecedor: number;
  referencia: number;
  quantidade: number;
  custo: number;
  data: number;
  confrontar: number;
};

function colunasDoCabecalho(cabecalho: string[]): Colunas {
  return {
    produto: indice(cabecalho, CABECALHOS.produto),
    fornecedor: indice(cabecalho, CABECALHOS.fornecedor),
    referencia: indice(cabecalho, CABECALHOS.referencia),
    quantidade: indice(cabecalho, CABECALHOS.quantidade),
    custo: indice(cabecalho, CABECALHOS.custo),
    data: indice(cabecalho, CABECALHOS.data),
    confrontar: indice(cabecalho, CABECALHOS.confrontar)
  };
}

function colunasCompletas(colunas: Colunas): boolean {
  return (
    colunas.produto >= 0 &&
    colunas.quantidade >= 0 &&
    colunas.custo >= 0 &&
    colunas.data >= 0 &&
    (colunas.fornecedor >= 0 || colunas.referencia >= 0)
  );
}

function descreverFaltas(colunas: Colunas): string {
  const faltas: string[] = [];
  if (colunas.produto < 0) faltas.push("PRODUTOS");
  if (colunas.fornecedor < 0 && colunas.referencia < 0) faltas.push("FORNECEDOR ou REFERÊNCIA");
  if (colunas.quantidade < 0) faltas.push("QUANT");
  if (colunas.custo < 0) faltas.push("VALOR CUSTO UN");
  if (colunas.data < 0) faltas.push("DATA REF");
  return faltas.join(", ");
}

const CONFRONTO_RECUSADO = /NAO CONFRONTADO|ERRO|^N A$/u;

function linhasDeUmaAba(
  celulas: string[][],
  numeros: number[],
  origem: OrigemNumero
): { linhas: HistoricoLinha[]; achouCabecalho: boolean; faltas: string } {
  let cabecalhoEm = -1;
  let colunas: Colunas | null = null;
  let melhorParcial: Colunas | null = null;
  const limite = Math.min(celulas.length, LINHAS_PROCURANDO_CABECALHO);
  for (let posicao = 0; posicao < limite; posicao += 1) {
    const candidata = colunasDoCabecalho(celulas[posicao] ?? []);
    if (colunasCompletas(candidata)) {
      cabecalhoEm = posicao;
      colunas = candidata;
      break;
    }
    if (candidata.produto >= 0 && candidata.custo >= 0 && !melhorParcial) melhorParcial = candidata;
  }
  if (!colunas)
    return { linhas: [], achouCabecalho: false, faltas: melhorParcial ? descreverFaltas(melhorParcial) : "" };

  const linhas: HistoricoLinha[] = [];
  for (let posicao = cabecalhoEm + 1; posicao < celulas.length; posicao += 1) {
    const linha = celulas[posicao] ?? [];
    const produto = (linha[colunas.produto] ?? "").trim();
    // Linha de estrutura (numeracao de colunas, subtotais): sem produto legivel nao e compra.
    if (!produto || /^\d+([.,]\d+)?$/u.test(produto)) continue;

    const referencia = colunas.referencia >= 0 ? (linha[colunas.referencia] ?? "").trim() : "";
    const fornecedorColuna = colunas.fornecedor >= 0 ? (linha[colunas.fornecedor] ?? "").trim() : "";
    const fornecedor = fornecedorColuna || fornecedorDaReferencia(referencia) || "";

    const motivos: string[] = [];
    const quantidade = numeroDaPlanilha(linha[colunas.quantidade] ?? "", origem);
    const custo = numeroDaPlanilha(linha[colunas.custo] ?? "", origem);
    const lido = (resultado: ReturnType<typeof numeroDaPlanilha>, nome: string): number | null => {
      if ("valor" in resultado) return resultado.valor;
      motivos.push(
        "ambiguo" in resultado
          ? `${nome} ambíguo (1.250: milhar ou decimal?). Exporte em XLSX ou use vírgula decimal`
          : `${nome} ilegível`
      );
      return null;
    };
    const quantidadeLida = lido(quantidade, "Quantidade");
    const custoLido = lido(custo, "Custo unitário");
    const dataCompra = dataDaPlanilha(linha[colunas.data] ?? "");
    if (!dataCompra) motivos.push("Data da compra ilegível");
    if (!fornecedor) motivos.push("Fornecedor não identificado");

    if (colunas.confrontar >= 0) {
      const confronto = (linha[colunas.confrontar] ?? "").trim();
      if (CONFRONTO_RECUSADO.test(normalizarNomeHistorico(confronto)))
        motivos.push(`Linha não confrontada (${confronto || "vazio"})`);
    }

    linhas.push({
      numeroLinha: numeros[posicao] ?? posicao + 1,
      fornecedor: fornecedor.slice(0, 300) || "(sem fornecedor)",
      produto: produto.slice(0, 300),
      dataCompra,
      quantidade: quantidadeLida,
      custoUnitario: custoLido,
      documento: referencia ? referencia.slice(0, 300) : null,
      motivoInvalida: motivos.length ? motivos.join("; ").slice(0, 300) : null
    });
    if (linhas.length > LIMITE_LINHAS_HISTORICO)
      throw erroValidacao(
        `A planilha tem mais de ${LIMITE_LINHAS_HISTORICO} linhas de compra; divida o arquivo por período`,
        "PURCHASE_HISTORY_TOO_MANY_ROWS"
      );
  }
  return { linhas, achouCabecalho: true, faltas: "" };
}

function decodificarCsv(buffer: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer).replace(/^\uFEFF/u, "");
  } catch {
    // CSV do Excel em portugues costuma sair em Windows-1252.
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

/** CSV (RFC 4180): campos entre aspas com separador, aspas duplicadas e quebra de linha dentro do campo. */
export function lerCsv(texto: string): string[][] {
  const primeira = texto.split(/\r?\n/u).find((linha) => linha.trim()) ?? "";
  const separador = [";", "\t", ","]
    .map((candidato) => ({ candidato, quantidade: primeira.split(candidato).length }))
    .sort((a, b) => b.quantidade - a.quantidade)[0]!.candidato;
  const linhas: string[][] = [];
  let atual: string[] = [];
  let campo = "";
  let entreAspas = false;
  for (let posicao = 0; posicao < texto.length; posicao += 1) {
    const caractere = texto[posicao]!;
    if (entreAspas) {
      if (caractere === '"' && texto[posicao + 1] === '"') {
        campo += '"';
        posicao += 1;
      } else if (caractere === '"') entreAspas = false;
      else campo += caractere;
    } else if (caractere === '"') entreAspas = true;
    else if (caractere === separador) {
      atual.push(campo);
      campo = "";
    } else if (caractere === "\n" || caractere === "\r") {
      if (caractere === "\r" && texto[posicao + 1] === "\n") posicao += 1;
      atual.push(campo);
      linhas.push(atual);
      atual = [];
      campo = "";
    } else campo += caractere;
  }
  if (campo || atual.length) {
    atual.push(campo);
    linhas.push(atual);
  }
  return linhas;
}

export type HistoricoLido = { linhas: HistoricoLinha[]; hashArquivo: string };

export function linhasDoHistorico(buffer: Buffer, nomeArquivo: string): HistoricoLido {
  const hashArquivo = createHash("sha256").update(buffer).digest("hex");
  const csv = nomeArquivo.toLocaleLowerCase("pt-BR").endsWith(".csv");
  let faltas = "";

  if (csv) {
    const celulas = lerCsv(decodificarCsv(buffer));
    const aba = linhasDeUmaAba(
      celulas,
      celulas.map((_, posicao) => posicao + 1),
      "csv"
    );
    if (aba.achouCabecalho) return finalizar(aba.linhas, hashArquivo);
    faltas = aba.faltas;
  } else {
    let planilha;
    try {
      planilha = abrirPlanilhaBuffer(buffer);
    } catch (erro) {
      if (erro instanceof ErroPlanilha) throw erroValidacao(erro.message, "PURCHASE_HISTORY_FILE_INVALID");
      throw erro;
    }
    for (const nomeAba of planilha.abas) {
      let aba;
      try {
        aba = planilha.ler(nomeAba, { maxLinhas: LIMITE_LINHAS_HISTORICO + LINHAS_DE_FOLGA });
      } catch (erro) {
        if (erro instanceof ErroPlanilha) throw erroValidacao(erro.message, "PURCHASE_HISTORY_FILE_INVALID");
        throw erro;
      }
      const lida = linhasDeUmaAba(aba.linhas, aba.numeros, "xlsx");
      if (lida.achouCabecalho) return finalizar(lida.linhas, hashArquivo);
      if (lida.faltas && !faltas) faltas = lida.faltas;
    }
  }
  throw erroValidacao(
    faltas
      ? `A planilha precisa ter as colunas: ${faltas}`
      : "Nenhuma aba tem as colunas PRODUTOS, FORNECEDOR (ou REFERÊNCIA), QUANT, VALOR CUSTO UN e DATA REF",
    "PURCHASE_HISTORY_COLUMNS_MISSING"
  );
}

function finalizar(linhas: HistoricoLinha[], hashArquivo: string): HistoricoLido {
  if (!linhas.length) throw erroValidacao("A planilha não tem linhas de compra", "PURCHASE_HISTORY_EMPTY_FILE");
  return { linhas, hashArquivo };
}
