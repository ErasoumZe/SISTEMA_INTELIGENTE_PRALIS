import { inputColumnsFor, mapProductToCells, traduzirParaPlanilhaNova, type CellMap } from "@padaria/shared/produtos";
import { env } from "../env.js";
import {
  a1,
  colToIndex,
  indexToCol,
  type SheetMeta,
  type SheetsGateway,
  type ValueRange
} from "../google/google-sheets-gateway.js";
import type { AlvoDaPlanilha } from "./produtos-planilha.repository.js";
import {
  baseParaPlanilhaRepository,
  linhaConhecidaDaBaseRepository,
  produtoDaLojaParaPlanilhaRepository,
  registrarLinhaDaPlanilhaRepository
} from "./produtos-planilha-produto.repository.js";
import { planilhaDaBase, planilhaDaLoja, type ProdutoParaPlanilha } from "./produtos-planilha-produto.js";
import { EspelhoNasAbasDeLoja } from "./produtos-planilha-lojas.js";
import {
  FIRST_DATA_ROW,
  FORMULA_TEMPLATE_ROW,
  HEADER_ROW,
  montarLayout,
  REQUIRED_FORMULA_COLUMNS,
  trechosContiguos,
  type SheetLayout
} from "./produtos-planilha-layout.js";

/**
 * Escritor REAL do espelho na planilha — porte de `ProductSheetService` do app oficial (R-222).
 *
 * Principios (do oficial, nao negociaveis):
 *  - o Postgres e a fonte; falha no Google nunca desfaz o cadastro (quem chama e a fila de reenvio);
 *  - a linha e achada pelo UUID na coluna ID, nunca so pelo numero salvo — a planilha e editada por gente;
 *  - formato e validacoes vem da linha-modelo 12; formula que a linha ja calcula nunca e sobrescrita;
 *  - texto vai RAW (zero a esquerda), numero/hora/percentual vao USER_ENTERED.
 *
 * Copia de loja NUNCA cria linha (regra do oficial de 25/09/2026, `syncStoreProducts`): ela escreve a faixa
 * da loja na linha do produto da BASE; sem essa linha, falha com o motivo e nao recadastra o produto.
 */
/** Lojas do app oficial; "SEM LOJA (...)" nao entra na planilha. */
const LOJAS_COM_FAIXA = new Set(["TNP", "LI", "HORA"]);

const isEmpty = (v: string | undefined): boolean => (v ?? "").trim() === "";
const ehFormula = (v: string | undefined) => typeof v === "string" && v.startsWith("=");

export class EscritorPlanilhaGoogle {
  /** Fila em processo: duas criacoes simultaneas nao podem escolher a MESMA primeira linha vazia. */
  private fila: Promise<void> = Promise.resolve();
  private sheetCache: SheetMeta | null = null;
  private layoutCache: SheetLayout | null = null;
  private readonly lojas: EspelhoNasAbasDeLoja;

  constructor(
    private readonly sheets: SheetsGateway,
    private readonly spreadsheetId: string,
    private readonly sheetName = env.GOOGLE_PRODUTOS_BASE_TAB
  ) {
    this.lojas = new EspelhoNasAbasDeLoja(sheets, spreadsheetId);
  }

  async escrever(alvo: AlvoDaPlanilha): Promise<{ linha: number | null }> {
    const item = await this.carregar(alvo);
    const ehBase = item.loja === "BASE";
    // Copia de loja sem vinculo com a BASE nao tem linha a que pertencer (oficial: `skipped`).
    if (!ehBase && !item.baseProductId) return { linha: null };
    // Empresa sem loja de PDV nao tem faixa: escreveria so as colunas gerais por cima da BASE.
    if (!ehBase && !LOJAS_COM_FAIXA.has(item.loja)) return { linha: null };
    // Cache frio e Google fora: o erro SOBE (a fila tenta de novo). O oficial devolvia `skipped` aqui, mas
    // la o espelho roda a cada salvamento; na fila do ERP isso marcaria a copia como sincronizada.
    if (!ehBase && !(await this.layoutValido()).layout.novo) return { linha: null };

    const linha = await this.enfileirar(() => (ehBase ? this.escreverBase(item, alvo) : this.escreverLoja(item)));
    // As abas (TNP)/(LI) recebem a MESMA linha; nunca derruba o que a combinada ja recebeu.
    await this.lojas.espelharNasAbasDeLoja([{ item, linha }]);
    return { linha };
  }

  private async carregar(alvo: AlvoDaPlanilha): Promise<ProdutoParaPlanilha> {
    if ("produtoBaseId" in alvo) {
      const linha = await baseParaPlanilhaRepository(alvo.produtoBaseId);
      if (!linha) throw new Error("Produto da BASE não encontrado.");
      return planilhaDaBase(linha);
    }
    const linha = await produtoDaLojaParaPlanilhaRepository(alvo.empresaId, alvo.produtoId);
    if (!linha) throw new Error("Produto não encontrado.");
    return planilhaDaLoja(linha);
  }

  private enfileirar<T>(fn: () => Promise<T>): Promise<T> {
    const proxima = this.fila.then(fn, fn);
    this.fila = proxima.then(
      () => undefined,
      () => undefined
    );
    return proxima;
  }

  private async resolverAba(): Promise<SheetMeta> {
    if (this.sheetCache) return this.sheetCache;
    const abas = await this.sheets.getSheets(this.spreadsheetId);
    const aba = abas.find((s) => s.title === this.sheetName);
    if (!aba) throw new Error(`Aba "${this.sheetName}" não encontrada na planilha.`);
    this.sheetCache = aba;
    return aba;
  }

  private async resolverLayout(aba: SheetMeta): Promise<SheetLayout> {
    if (this.layoutCache) return this.layoutCache;
    const ultimaColuna = indexToCol(Math.max(0, aba.columnCount - 1));
    const [range] = await this.sheets.batchGetValues(
      this.spreadsheetId,
      [a1(this.sheetName, `A${HEADER_ROW}:${ultimaColuna}${HEADER_ROW}`)],
      "FORMATTED_VALUE"
    );
    // A linha 3 marca as secoes na planilha nova; a antiga nao tem nada nela.
    const [faixasRange] = await this.sheets.batchGetValues(
      this.spreadsheetId,
      [a1(this.sheetName, `A3:${ultimaColuna}3`)],
      "FORMATTED_VALUE"
    );
    const layout = montarLayout(range?.[0] ?? [], faixasRange?.[0] ?? []);
    const { cabecalhos } = layout;
    // Layout invalido nao e cacheado: a correcao feita na planilha vale sem reiniciar a API.
    if (cabecalhos.every((h) => h.ok)) this.layoutCache = layout;
    return layout;
  }

  private async layoutValido(): Promise<{ aba: SheetMeta; layout: SheetLayout }> {
    const aba = await this.resolverAba();
    const layout = await this.resolverLayout(aba);
    const divergente = layout.cabecalhos.find((h) => !h.ok);
    if (divergente) {
      throw new Error(`Cabeçalho inesperado ou ausente na linha ${HEADER_ROW}: esperado "${divergente.esperado}".`);
    }
    return { aba, layout };
  }

  /**
   * Antes de reservar linha nova: o produto ja esta na aba SEM o ID (carga que entrou lendo a planilha)?
   * Reservar duplicaria o cadastro — o defeito de 25/09 do oficial. Recusa com o motivo; ligar a linha ao
   * produto e decisao de gente, nao do espelho.
   */
  private async recusarSeJaEstaSemId(item: ProdutoParaPlanilha, layout: SheetLayout): Promise<void> {
    const codigo = item.produto.codigoInterno?.trim();
    if (!codigo || layout.colunasCodigoInterno.length === 0) return;
    const semZeros = (v: string) => v.trim().replace(/^0+(?=\d)/u, "");
    const lido = await this.sheets.batchGetValues(
      this.spreadsheetId,
      layout.colunasCodigoInterno.map((c) => a1(this.sheetName, `${c}${FIRST_DATA_ROW}:${c}`)),
      "FORMATTED_VALUE"
    );
    for (const coluna of lido) {
      const indice = coluna.findIndex((r) => semZeros(r?.[0] ?? "") === semZeros(codigo));
      if (indice >= 0) {
        throw new Error(
          `O código interno ${codigo} já está na linha ${FIRST_DATA_ROW + indice} da planilha, sem o ID do ` +
            "sistema. Nada foi escrito para não duplicar o produto; preencha o ID dessa linha."
        );
      }
    }
  }

  /** Produto da BASE: acha a linha pelo ID ou reserva a primeira livre; depois formulas e celulas. */
  private async escreverBase(item: ProdutoParaPlanilha, alvo: AlvoDaPlanilha): Promise<number> {
    const { aba, layout } = await this.layoutValido();
    const lido = await this.sheets.batchGetValues(
      this.spreadsheetId,
      [
        a1(this.sheetName, `${layout.footer.id}${FIRST_DATA_ROW}:${layout.footer.id}`),
        a1(this.sheetName, `${layout.colunaNome}${FIRST_DATA_ROW}:${layout.colunaNome}`)
      ],
      "FORMATTED_VALUE"
    );
    const colunaIds = (lido[0] ?? []).map((r) => (r?.[0] ?? "").trim());
    const colunaNomes = (lido[1] ?? []).map((r) => (r?.[0] ?? "").trim());
    const idDaLinha = item.produto.id;
    const existente = colunaIds.indexOf(idDaLinha);
    const linhaExistente = existente >= 0 ? FIRST_DATA_ROW + existente : null;
    const linha = linhaExistente ?? this.primeiraLinhaLivre(colunaNomes, colunaIds);

    if (linhaExistente === null) {
      await this.recusarSeJaEstaSemId(item, layout);
      // A ordem e o contrato: capacidade -> reserva so do ID -> registra a linha -> formato da linha-modelo.
      await this.garantirCapacidade(aba, linha);
      await this.sheets.batchUpdateValues(
        this.spreadsheetId,
        [{ range: a1(this.sheetName, `${layout.footer.id}${linha}`), values: [[idDaLinha]] }],
        "RAW"
      );
      await registrarLinhaDaPlanilhaRepository(alvo, linha).catch(() => undefined);
      await this.copiarEstrutura(aba, linha);
    }
    // Repara reservas interrompidas sem criar outra linha.
    await this.garantirFormulas(aba, linha, layout.novo !== null);
    await this.gravarCelulas(item, linha, layout, aba);
    return linha;
  }

  /** Copia de loja (planilha nova): so a faixa dela, na linha do produto da BASE. Nunca cria linha. */
  private async escreverLoja(item: ProdutoParaPlanilha): Promise<number> {
    const { aba, layout } = await this.layoutValido();
    const baseId = item.baseProductId!;
    const [ids] = await this.sheets.batchGetValues(
      this.spreadsheetId,
      [a1(this.sheetName, `${layout.footer.id}${FIRST_DATA_ROW}:${layout.footer.id}`)],
      "FORMATTED_VALUE"
    );
    const indice = (ids ?? []).findIndex((r) => (r?.[0] ?? "").trim() === baseId);
    const linha = indice >= 0 ? FIRST_DATA_ROW + indice : await this.linhaDoBanco(item);
    if (linha == null) {
      throw new Error("Linha do produto da BASE desconhecida. Nada foi escrito para não recadastrá-lo na planilha.");
    }
    await this.gravarCelulas(item, linha, layout, aba);
    return linha;
  }

  private async linhaDoBanco(item: ProdutoParaPlanilha): Promise<number | null> {
    // A fila guarda a linha pelo id do ERP da BASE; o item da loja so conhece o id do oficial.
    return item.baseErpId ? linhaConhecidaDaBaseRepository(item.baseErpId) : null;
  }

  private primeiraLinhaLivre(nomes: string[], ids: string[]): number {
    const total = Math.max(nomes.length, ids.length);
    for (let i = 0; i < total; i++) {
      if (isEmpty(nomes[i]) && isEmpty(ids[i])) return FIRST_DATA_ROW + i;
    }
    return FIRST_DATA_ROW + total;
  }

  private async garantirCapacidade(aba: SheetMeta, linha: number): Promise<void> {
    if (aba.rowCount >= linha) return;
    await this.sheets.batchUpdate(this.spreadsheetId, [
      { appendDimension: { sheetId: aba.sheetId, dimension: "ROWS", length: linha - aba.rowCount } }
    ]);
    aba.rowCount = linha;
  }

  /**
   * Formato e validacoes da LINHA-MODELO fixa (nao da anterior: o erro seria cumulativo). Duas requisicoes:
   * PASTE_FORMAT nao traz as listas suspensas (documentacao do Sheets), PASTE_DATA_VALIDATION traz.
   */
  private async copiarEstrutura(aba: SheetMeta, linha: number): Promise<void> {
    if (linha === FORMULA_TEMPLATE_ROW) return;
    const faixa = (r: number) => ({
      sheetId: aba.sheetId,
      startRowIndex: r - 1,
      endRowIndex: r,
      startColumnIndex: 0,
      endColumnIndex: aba.columnCount
    });
    await this.sheets.batchUpdate(
      this.spreadsheetId,
      (["PASTE_FORMAT", "PASTE_DATA_VALIDATION"] as const).map((pasteType) => ({
        copyPaste: { source: faixa(FORMULA_TEMPLATE_ROW), destination: faixa(linha), pasteType }
      }))
    );
  }

  /** Copia so as formulas que faltam, da linha-modelo 12 (planilha nova: o que for formula nela). */
  private async garantirFormulas(aba: SheetMeta, linha: number, novo: boolean): Promise<void> {
    if (linha === FIRST_DATA_ROW || linha === FORMULA_TEMPLATE_ROW) return;
    const ultimaColuna = indexToCol(Math.max(0, aba.columnCount - 1));
    const [modeloRange, destinoRange] = await this.sheets.batchGetValues(
      this.spreadsheetId,
      [
        a1(this.sheetName, `A${FORMULA_TEMPLATE_ROW}:${ultimaColuna}${FORMULA_TEMPLATE_ROW}`),
        a1(this.sheetName, `A${linha}:${ultimaColuna}${linha}`)
      ],
      "FORMULA"
    );
    const modelo = modeloRange?.[0] ?? [];
    const destinoAtual = destinoRange?.[0] ?? [];
    const colunasComFormula: string[] = novo
      ? modelo.map((v, i) => (ehFormula(v) ? indexToCol(i) : "")).filter(Boolean)
      : [...REQUIRED_FORMULA_COLUMNS];
    if (colunasComFormula.length === 0) {
      throw new Error(
        `Linha-modelo ${FORMULA_TEMPLATE_ROW} sem fórmula nenhuma. Nada foi gravado nas células do produto.`
      );
    }
    const ausente = novo ? undefined : colunasComFormula.find((c) => !ehFormula(modelo[colToIndex(c)]));
    if (ausente) {
      throw new Error(
        `Linha-modelo ${FORMULA_TEMPLATE_ROW} incompleta: fórmula ausente na coluna ${ausente}. Nada foi gravado nas células do produto.`
      );
    }
    const faltantes = colunasComFormula.map(colToIndex).filter((c) => !ehFormula(destinoAtual[c]));
    const faixa = (r: number, c0: number, c1: number) => ({
      sheetId: aba.sheetId,
      startRowIndex: r - 1,
      endRowIndex: r,
      startColumnIndex: c0,
      endColumnIndex: c1
    });
    await this.sheets.batchUpdate(
      this.spreadsheetId,
      trechosContiguos(faltantes).map(([c0, c1]) => ({
        copyPaste: {
          source: faixa(FORMULA_TEMPLATE_ROW, c0, c1),
          destination: faixa(linha, c0, c1),
          pasteType: "PASTE_FORMULA"
        }
      }))
    );

    // A formula historica de AP fixa $BB$11:$BH$11 (dias do primeiro produto); aqui vale a propria linha.
    const [apRange] = await this.sheets.batchGetValues(
      this.spreadsheetId,
      [a1(this.sheetName, `AP${linha}`)],
      "FORMULA"
    );
    const formulaAp = apRange?.[0]?.[0] ?? "";
    if (formulaAp.startsWith("=")) {
      const corrigida = formulaAp.replace(/\$BB\$11:\$BH\$11/gu, () => `$BB$${linha}:$BH$${linha}`);
      if (corrigida !== formulaAp) {
        await this.sheets.batchUpdateValues(
          this.spreadsheetId,
          [{ range: a1(this.sheetName, `AP${linha}`), values: [[corrigida]] }],
          "USER_ENTERED"
        );
      }
    }
  }

  /** Colunas que a PROPRIA linha calcula (le a linha de destino: o guarda se auto-corrige). */
  private async calculadasPorLinha(aba: SheetMeta, linha: number): Promise<Set<string>> {
    const ultimaColuna = indexToCol(Math.max(0, aba.columnCount - 1));
    const [lido] = await this.sheets.batchGetValues(
      this.spreadsheetId,
      [a1(this.sheetName, `A${linha}:${ultimaColuna}${linha}`)],
      "FORMULA"
    );
    const calculadas = new Set<string>();
    (lido?.[0] ?? []).forEach((valor, coluna) => {
      if (ehFormula(valor)) calculadas.add(indexToCol(coluna));
    });
    return calculadas;
  }

  /**
   * Escreve SOMENTE as colunas de entrada, uma range por coluna. Na planilha nova o mapa e traduzido antes
   * (as letras do mapa sao do leiaute antigo); produto da BASE passa loja `null` e nao toca as faixas de loja.
   */
  private async gravarCelulas(item: ProdutoParaPlanilha, linha: number, layout: SheetLayout, aba: SheetMeta) {
    const calculadas = layout.novo ? await this.calculadasPorLinha(aba, linha) : new Set<string>();
    const cells: CellMap = mapProductToCells(item.produto, {
      defaultLojas: env.GOOGLE_PRODUTOS_DEFAULT_LOJAS,
      footerColumns: layout.footer
    });
    const paraEscrever: CellMap = layout.novo
      ? traduzirParaPlanilhaNova(cells, layout.novo, item.loja === "BASE" ? null : item.loja, indexToCol).celulas
      : cells;
    const colunas = layout.novo ? Object.keys(paraEscrever) : inputColumnsFor(layout.footer);
    const raw: ValueRange[] = [];
    const userEntered: ValueRange[] = [];
    for (const col of colunas) {
      const cell = paraEscrever[col];
      if (!cell || calculadas.has(col)) continue; // o calculo e da planilha; nao se troca por valor
      const range = a1(this.sheetName, `${col}${linha}`);
      if (cell.kind === "text") raw.push({ range, values: [[cell.value]] });
      else if (cell.kind === "empty") userEntered.push({ range, values: [[""]] });
      else userEntered.push({ range, values: [[cell.value]] });
    }
    if (userEntered.length) await this.sheets.batchUpdateValues(this.spreadsheetId, userEntered, "USER_ENTERED");
    if (raw.length) await this.sheets.batchUpdateValues(this.spreadsheetId, raw, "RAW");
  }
}
