import { createHash } from "node:crypto";
import { abrirPlanilhaBuffer } from "@padaria/db/planilha-xlsx";
import { normalizarDescricaoPrecoBase } from "@padaria/shared/compras";
import { erroValidacao } from "../erros.js";

const CABECALHOS_CUSTO = new Set(["ULTIMO MENOR CUSTO", "ULTIMO CUSTO MENOR"]);
const CABECALHOS_DESCRICAO = new Set(["DESCRICAO", "PRODUTO", "NOME DO PRODUTO"]);
const CABECALHOS_CODIGO = new Set(["CODIGO", "CODIGO INTERNO", "COD PRODUTO"]);
const CABECALHOS_EAN = new Set(["EAN", "CODIGO DE BARRAS", "COD BARRAS"]);

function indiceCabecalho(cabecalho: string[], nomes: Set<string>): number {
  return cabecalho.findIndex((celula) => nomes.has(normalizarDescricaoPrecoBase(celula)));
}

function numeroPlanilha(valor: string): number | null {
  const limpo = valor
    .trim()
    .replace(/^R\$\s*/i, "")
    .replace(/\s/g, "");
  if (!limpo) return null;
  const normalizado = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
  const numero = Number(normalizado);
  return Number.isFinite(numero) && numero >= 0 ? numero : null;
}

export function linhasDePrecoBaseDoXlsx(buffer: Buffer) {
  const planilha = abrirPlanilhaBuffer(buffer);
  for (const nomeAba of planilha.abas) {
    const aba = planilha.ler(nomeAba);
    const indiceCabecalhoLinha = aba.linhas.findIndex((linha) => indiceCabecalho(linha, CABECALHOS_CUSTO) >= 0);
    if (indiceCabecalhoLinha < 0) continue;
    const cabecalho = aba.linhas[indiceCabecalhoLinha] ?? [];
    const colunaCusto = indiceCabecalho(cabecalho, CABECALHOS_CUSTO);
    const colunaDescricao = indiceCabecalho(cabecalho, CABECALHOS_DESCRICAO);
    const colunaCodigo = indiceCabecalho(cabecalho, CABECALHOS_CODIGO);
    const colunaEan = indiceCabecalho(cabecalho, CABECALHOS_EAN);
    if (colunaDescricao < 0)
      throw erroValidacao(
        'A planilha precisa ter uma coluna "DESCRIÇÃO" ou "PRODUTO"',
        "PRICE_BASE_DESCRIPTION_MISSING"
      );

    const linhas = aba.linhas.slice(indiceCabecalhoLinha + 1).flatMap((linha, indice) => {
      const descricao = linha[colunaDescricao]?.trim() ?? "";
      const custoTexto = linha[colunaCusto]?.trim() ?? "";
      if (!descricao && !custoTexto) return [];
      const custo = numeroPlanilha(custoTexto);
      if (custo === null)
        throw erroValidacao(`Custo invalido na linha ${indiceCabecalhoLinha + indice + 2}`, "PRICE_BASE_INVALID_COST");
      return [
        {
          numeroLinha: indiceCabecalhoLinha + indice + 2,
          codigo: colunaCodigo >= 0 ? linha[colunaCodigo]?.trim() || null : null,
          ean: colunaEan >= 0 ? linha[colunaEan]?.trim() || null : null,
          descricao,
          ultimoMenorCusto: custo
        }
      ];
    });
    if (!linhas.length) throw erroValidacao("A planilha nao possui linhas de preco-base", "PRICE_BASE_EMPTY_FILE");
    return { nomeAba, linhas, hashArquivo: createHash("sha256").update(buffer).digest("hex") };
  }
  throw erroValidacao('Nenhuma aba possui a coluna "ÚLTIMO MENOR CUSTO"', "PRICE_BASE_COST_COLUMN_MISSING");
}
