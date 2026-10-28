import {
  lerLeiaute,
  mapProductToCells,
  normalizarCabecalho,
  traduzirParaPlanilhaNova,
  type CellMap,
  type LeiauteNovo
} from "@padaria/shared/produtos";
import { env } from "../env.js";
import {
  a1,
  colToIndex,
  indexToCol,
  type SheetMeta,
  type SheetsGateway,
  type ValueRange
} from "../google/google-sheets-gateway.js";
import type { ProdutoParaPlanilha } from "./produtos-planilha-produto.js";

/**
 * Espelho nas abas `(TNP)`/`(LI) CADASTRO PRODUTOS` — porte de `espelharNasAbasDeLoja` do app oficial
 * (`product-sheet-loja.service.ts`, R-222). Elas sao copias linha a linha da aba combinada: cada produto
 * ocupa a MESMA linha em todas, e a aba de uma loja so recebe escrita dos produtos DAQUELA loja (regra do
 * oficial de 25/09/2026: importar para a TNP nao faz a linha aparecer na LI). HORA fica de fora.
 *
 * Porte so do leiaute NOVO (o da planilha de producao desde 09/09/2026); o espelho legado por posicao
 * (`espelharVarios`) nao foi portado.
 */
export const LOJAS_ESPELHADAS = ["TNP", "LI"] as const;
export type LojaEspelhada = (typeof LOJAS_ESPELHADAS)[number];
export type EspelhoLojaResultado = "sem-aba" | "espelhado" | "falhou";

const LINHA_CABECALHO = 5;
const ABA_PADRAO: Record<LojaEspelhada, string> = {
  TNP: "(TNP) CADASTRO PRODUTOS",
  LI: "(LI) CADASTRO PRODUTOS"
};

export interface ItemNaLinha {
  item: ProdutoParaPlanilha;
  linha: number;
}

const ehLojaEspelhada = (loja: string): loja is LojaEspelhada => (LOJAS_ESPELHADAS as readonly string[]).includes(loja);

/** Aba configurada para a loja; config invalida nunca escreve no lugar errado. */
export function abaDaLoja(loja: string, configurado = env.GOOGLE_PRODUTOS_LOJA_TABS): string | null {
  if (!ehLojaEspelhada(loja)) return null;
  if (!configurado.trim()) return ABA_PADRAO[loja];
  try {
    const json = JSON.parse(configurado) as Record<string, string>;
    const aba = json[loja]?.trim();
    return aba || null; // aba vazia na config = loja desligada
  } catch {
    return null;
  }
}

export class EspelhoNasAbasDeLoja {
  constructor(
    private readonly sheets: SheetsGateway,
    private readonly spreadsheetId: string
  ) {}

  /** Nunca lanca: roda depois de a combinada ter gravado, e falha aqui nao desconta aquilo. */
  async espelharNasAbasDeLoja(itens: readonly ItemNaLinha[]): Promise<EspelhoLojaResultado> {
    if (itens.length === 0) return "espelhado";
    const porLoja = new Map<LojaEspelhada, ItemNaLinha[]>();
    for (const item of itens) {
      const loja = item.item.loja;
      if (!ehLojaEspelhada(loja)) continue;
      porLoja.set(loja, [...(porLoja.get(loja) ?? []), item]);
    }
    const destinos = [...porLoja]
      .map(([loja, seus]) => ({ loja, seus, aba: abaDaLoja(loja) }))
      .filter((d): d is { loja: LojaEspelhada; seus: ItemNaLinha[]; aba: string } => !!d.aba);
    if (destinos.length === 0) return "sem-aba";

    try {
      const abas = await this.sheets.getSheets(this.spreadsheetId);
      for (const { loja, aba, seus } of destinos) {
        const meta = abas.find((a) => a.title === aba);
        if (!meta) return "falhou";
        await this.escreverNaAbaDaLoja(meta, aba, loja, seus);
      }
      return "espelhado";
    } catch {
      return "falhou";
    }
  }

  /** Leiaute da aba + as FORMULAS de cada linha alvo, numa leitura so. */
  private async lerAbaDaLoja(meta: SheetMeta, aba: string, loja: LojaEspelhada, itens: readonly ItemNaLinha[]) {
    const ultimaColuna = indexToCol(Math.max(0, meta.columnCount - 1));
    const lido = await this.sheets.batchGetValues(
      this.spreadsheetId,
      [
        a1(aba, `A3:${ultimaColuna}3`),
        a1(aba, `A${LINHA_CABECALHO}:${ultimaColuna}${LINHA_CABECALHO}`),
        ...itens.map(({ linha }) => a1(aba, `A${linha}:${ultimaColuna}${linha}`))
      ],
      "FORMULA"
    );
    const layout: LeiauteNovo = lerLeiaute(lido[0]?.[0] ?? [], lido[1]?.[0] ?? [], indexToCol);
    const faixaDaLoja = normalizarCabecalho(`${loja} - CADASTRO`);
    if (!layout.faixas.some((f) => f.nome === faixaDaLoja)) {
      throw new Error(`A aba "${aba}" não tem a faixa "${faixaDaLoja}".`);
    }
    return { layout, formulasPorItem: itens.map((_, i) => lido[i + 2]?.[0] ?? []) };
  }

  /** As colunas desta aba que pertencem a este produto; a faixa da loja so quando o produto e dela. */
  private colunasDoProdutoNaAba(item: ProdutoParaPlanilha, layout: LeiauteNovo, loja: LojaEspelhada): CellMap {
    const cells = mapProductToCells(item.produto, { defaultLojas: env.GOOGLE_PRODUTOS_DEFAULT_LOJAS });
    return traduzirParaPlanilhaNova(cells, layout, item.loja === loja ? loja : null, indexToCol).celulas;
  }

  private async escreverNaAbaDaLoja(meta: SheetMeta, aba: string, loja: LojaEspelhada, itens: readonly ItemNaLinha[]) {
    const { layout, formulasPorItem } = await this.lerAbaDaLoja(meta, aba, loja, itens);
    await this.garantirCapacidade(meta, Math.max(...itens.map((i) => i.linha)));
    const raw: ValueRange[] = [];
    const interpretado: ValueRange[] = [];
    itens.forEach(({ item, linha }, i) => {
      const formulasDaLinha = formulasPorItem[i] ?? [];
      for (const [coluna, celula] of Object.entries(this.colunasDoProdutoNaAba(item, layout, loja))) {
        // Nao troca calculo da planilha por valor congelado.
        if ((formulasDaLinha[colToIndex(coluna)] ?? "").startsWith("=")) continue;
        const range = a1(aba, `${coluna}${linha}`);
        if (celula.kind === "text") raw.push({ range, values: [[celula.value]] });
        else if (celula.kind === "empty") interpretado.push({ range, values: [[""]] });
        else interpretado.push({ range, values: [[celula.value]] });
      }
    });
    if (interpretado.length) await this.sheets.batchUpdateValues(this.spreadsheetId, interpretado, "USER_ENTERED");
    if (raw.length) await this.sheets.batchUpdateValues(this.spreadsheetId, raw, "RAW");
  }

  private async garantirCapacidade(aba: SheetMeta, linha: number): Promise<void> {
    if (aba.rowCount >= linha) return;
    await this.sheets.batchUpdate(this.spreadsheetId, [
      { appendDimension: { sheetId: aba.sheetId, dimension: "ROWS", length: linha - aba.rowCount } }
    ]);
    aba.rowCount = linha;
  }
}
