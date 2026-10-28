import { colunaDoCampo, lerLeiaute, type LeiauteNovo, type SheetFooterColumns } from "@padaria/shared/produtos";
import { colToIndex, indexToCol } from "../google/google-sheets-gateway.js";

/**
 * O leiaute da aba `(BASE) CADASTRO PRODUTOS` como o escritor precisa (porte de `resolverLayout` do
 * `ProductSheetService` oficial, R-222): linha 5 = cabecalhos, dados a partir da 11, linha-modelo 12.
 */
export const FIRST_DATA_ROW = 11;
export const HEADER_ROW = 5;
/** Linha-modelo validada que contem o conjunto completo de formulas. */
export const FORMULA_TEMPLATE_ROW = 12;
/** Colunas de formula do leiaute ANTIGO; na planilha nova a regra sai da propria linha 12. */
export const REQUIRED_FORMULA_COLUMNS = [
  "H",
  "U",
  "AD",
  "AF",
  "AH",
  "AK",
  "AO",
  "AP",
  "AR",
  "AT",
  "AV",
  "AX",
  "AY",
  "BI",
  "BJ",
  "BR"
] as const;
/** Cabecalhos obrigatorios do leiaute antigo: se nao baterem, a planilha mudou e NADA e gravado. */
const REQUIRED_FIXED_HEADERS = [
  { coluna: "E", esperado: "NOME" },
  { coluna: "AC", esperado: "CODIGO INT." }
] as const;

export interface SheetLayout {
  footer: SheetFooterColumns;
  cabecalhos: Array<{ coluna: string; esperado: string; encontrado: string; ok: boolean }>;
  /**
   * Preenchido quando a aba marca FAIXAS na linha 3 — e a planilha nova. Nela as mesmas letras significam
   * outra coisa (`F` era QUANTIDADE e agora e CODIGO BARRAS): escrever por posicao fixa ali e erro.
   */
  novo: LeiauteNovo | null;
  /** Coluna do nome do produto, que muda de lugar entre os dois leiautes. */
  colunaNome: string;
  /** Toda coluna `CODIGO INT.` da aba (na nova, uma por loja): guarda contra linha duplicada. */
  colunasCodigoInterno: string[];
}

/** Compara cabecalho ignorando acento, caixa, espaco extra e ponto final (oficial `normalizeHeader`). */
export const normalizeHeader = (v: string): string =>
  (v ?? "").normalize("NFD").replace(/[̀-ͯ]/gu, "").toUpperCase().replace(/\s+/gu, " ").replace(/\.+$/u, "").trim();

/**
 * Monta o leiaute a partir das linhas 5 (cabecalhos) e 3 (faixas). A planilha nova e DETECTADA pelos
 * rotulos da linha 3, em vez de configurada: uma flag a menos para alguem esquecer de virar.
 */
export function montarLayout(headers: readonly string[], linhaFaixas: readonly string[]): SheetLayout {
  const temFaixas = linhaFaixas.some((x) => String(x ?? "").trim() !== "");
  const novo = temFaixas ? lerLeiaute(linhaFaixas, headers, indexToCol) : null;

  const encontrado = (coluna: string) => headers[colToIndex(coluna)] ?? "";
  const localizar = (nome: string): string | null => {
    const alvo = normalizeHeader(nome);
    const i = headers.findIndex((h) => normalizeHeader(h) === alvo);
    return i >= 0 ? indexToCol(i) : null;
  };
  const id = localizar("ID");
  const photo = localizar("FOTO");
  const help = localizar("HABILITAR AJUDA");
  // Na nova o casamento e por nome; o que ela precisa mesmo e do ID (sem ele, duplica a cada sincronismo).
  const nomeNaNova = novo ? colunaDoCampo(novo, "CADASTRO PRODUTOS ATUALIZADO NOVO", indexToCol) : null;
  const cabecalhos: SheetLayout["cabecalhos"] = novo
    ? [
        { coluna: id ?? "?", esperado: "ID", encontrado: id ? encontrado(id) : "", ok: !!id },
        {
          coluna: nomeNaNova ?? "?",
          esperado: "CADASTRO PRODUTOS ATUALIZADO NOVO",
          encontrado: nomeNaNova ? encontrado(nomeNaNova) : "",
          ok: !!nomeNaNova
        }
      ]
    : [
        ...REQUIRED_FIXED_HEADERS.map((h) => ({
          coluna: h.coluna,
          esperado: h.esperado,
          encontrado: encontrado(h.coluna),
          ok: normalizeHeader(encontrado(h.coluna)) === normalizeHeader(h.esperado)
        })),
        { coluna: id ?? "?", esperado: "ID", encontrado: id ? encontrado(id) : "", ok: !!id },
        { coluna: photo ?? "?", esperado: "FOTO", encontrado: photo ? encontrado(photo) : "", ok: !!photo }
      ];
  return {
    footer: { id: id ?? "", photo: photo ?? "", help },
    cabecalhos,
    novo,
    colunaNome: (novo ? nomeNaNova : "E") ?? "E",
    colunasCodigoInterno: headers.flatMap((h, i) =>
      normalizeHeader(h) === normalizeHeader("CODIGO INT.") ? [indexToCol(i)] : []
    )
  };
}

/** Indices [inicio, fim) das sequencias de celulas que contem formula. */
export function trechosContiguos(colunas: number[]): Array<[number, number]> {
  const trechos: Array<[number, number]> = [];
  for (const coluna of colunas) {
    const ultimo = trechos[trechos.length - 1];
    if (ultimo && ultimo[1] === coluna) ultimo[1] = coluna + 1;
    else trechos.push([coluna, coluna + 1]);
  }
  return trechos;
}
