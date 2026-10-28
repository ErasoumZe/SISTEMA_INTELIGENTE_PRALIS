import { env } from "../env.js";
import { cabecalhoGoogle, executarGoogleJson, obterTokenGoogle, type GoogleFetcher } from "./google-errors.js";

/**
 * Costura fina sobre a API do Google Sheets para o ESPELHO do cadastro — porte de `google-sheets.client.ts`
 * do app oficial (R-222). Existe para que o escritor seja testavel sem rede: os testes injetam um duble de
 * `SheetsGateway`. A credencial e a OAuth do ERP (`obterTokenGoogle`), nao a conta de servico do oficial.
 *
 * REGRA: nenhuma credencial pode aparecer em log ou em mensagem de erro.
 */

export type ValueRenderOption = "FORMATTED_VALUE" | "UNFORMATTED_VALUE" | "FORMULA";
export type ValueInputOption = "RAW" | "USER_ENTERED";

export interface SheetMeta {
  sheetId: number;
  title: string;
  rowCount: number;
  columnCount: number;
}

export interface ValueRange {
  range: string;
  values: Array<Array<string | number | boolean | null>>;
}

export interface SheetsGateway {
  /** Metadados das abas (sheetId real por titulo, tamanho da grade). */
  getSheets(spreadsheetId: string): Promise<SheetMeta[]>;
  /** Leitura em lote. Devolve, por range, a matriz de celulas (sempre string). */
  batchGetValues(spreadsheetId: string, ranges: string[], renderOption?: ValueRenderOption): Promise<string[][][]>;
  /** Escrita em lote de VALORES (nao toca no formato/formula das outras colunas). */
  batchUpdateValues(spreadsheetId: string, data: ValueRange[], valueInputOption: ValueInputOption): Promise<void>;
  /** Requests estruturais (copyPaste de formato/formula, appendDimension). */
  batchUpdate(spreadsheetId: string, requests: object[]): Promise<void>;
}

/** Escapa o titulo da aba para uso em notacao A1: '(BASE) CADASTRO PRODUTOS'!E11 */
export const quoteSheetTitle = (title: string): string => `'${title.replace(/'/gu, "''")}'`;

/** Range A1 ja com a aba escapada. */
export const a1 = (title: string, range: string): string => `${quoteSheetTitle(title)}!${range}`;

/** 'A' -> 0, 'Z' -> 25, 'AA' -> 26, 'CP' -> 93 */
export const colToIndex = (col: string): number => {
  let n = 0;
  for (const ch of col.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

/** 0 -> 'A', 26 -> 'AA' */
export const indexToCol = (index: number): string => {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rest = (n - 1) % 26;
    out = String.fromCharCode(65 + rest) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
};

/** Nunca deixa credencial/token vazar para o banco ou para o log (oficial `sanitizeError`). */
export function sanitizeError(e: Error | string): string {
  const raw = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  return raw
    .replace(/-----BEGIN[\s\S]*?-----END[^-]*-----/gu, "[credencial removida]")
    .replace(
      /(private[_-]?key|api[_-]?key|access[_-]?token|refresh[_-]?token|secret|password|bearer)\s*[=:]?\s*\S+/giu,
      "$1 [oculto]"
    )
    .replace(/[A-Za-z0-9_-]{40,}/gu, "[oculto]")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 500);
}

export class GoogleSheetsSobTesteError extends Error {
  constructor(operacao: string) {
    super(
      `Bloqueado: o cliente REAL do Google Sheets foi acionado dentro de um teste (${operacao}). ` +
        "Injete um duble de SheetsGateway em vez de usar o cliente real."
    );
    this.name = "GoogleSheetsSobTesteError";
  }
}

/** O Vitest define `VITEST` e, quando ninguem disse o contrario, `NODE_ENV=test`. */
export const sobTeste = (): boolean => !!process.env["VITEST"] || process.env["NODE_ENV"] === "test";

/** O Sheets devolve '' para celula vazia; normaliza tudo para string. */
const toStringMatrix = (values: Array<Array<string | number | boolean | null>> | undefined): string[][] =>
  (values ?? []).map((row) => (row ?? []).map((c) => (c == null ? "" : String(c))));

type MetadadosResposta = {
  sheets?: Array<{
    properties?: { sheetId?: number; title?: string; gridProperties?: { rowCount?: number; columnCount?: number } };
  }>;
};
type LoteResposta = { valueRanges?: Array<{ values?: Array<Array<string | number | boolean | null>> }> };

export class GoogleSheetsGatewayReal implements SheetsGateway {
  constructor(
    private readonly fetcher: GoogleFetcher = (input, init) => fetch(input, init),
    private readonly tokenProvider: () => Promise<string> = obterTokenGoogle,
    private readonly prazoMs = env.GOOGLE_PRODUTOS_TIMEOUT_MS
  ) {}

  /**
   * TRAVA DE PRODUCAO (oficial, 16/09/2026): uma suite de teste resolveu o cliente real e gravou 123 linhas
   * de fixture na planilha oficial. A trava mora no cliente real: quem injeta um duble continua exercitando
   * o escritor inteiro, e quem tentar falar com o Google de verdade sob teste falha alto.
   *
   * `retry` nao existe aqui de proposito: quem repete e a fila de reenvio, com espera crescente.
   */
  private async chamar<T>(operacao: string, url: string, init: RequestInit = {}): Promise<T> {
    if (sobTeste()) throw new GoogleSheetsSobTesteError(operacao);
    const token = await this.tokenProvider();
    return executarGoogleJson<T>(
      this.fetcher,
      url,
      {
        ...init,
        headers: cabecalhoGoogle(token, init.body ? "application/json" : undefined),
        ...(this.prazoMs > 0 ? { signal: AbortSignal.timeout(this.prazoMs) } : {})
      },
      operacao
    );
  }

  private url(spreadsheetId: string, sufixo: string): string {
    return `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}${sufixo}`;
  }

  async getSheets(spreadsheetId: string): Promise<SheetMeta[]> {
    const campos = encodeURIComponent("sheets.properties(sheetId,title,gridProperties(rowCount,columnCount))");
    const res = await this.chamar<MetadadosResposta>("lista de abas", this.url(spreadsheetId, `?fields=${campos}`));
    return (res.sheets ?? []).map((s) => ({
      sheetId: s.properties?.sheetId ?? -1,
      title: s.properties?.title ?? "",
      rowCount: s.properties?.gridProperties?.rowCount ?? 0,
      columnCount: s.properties?.gridProperties?.columnCount ?? 0
    }));
  }

  async batchGetValues(
    spreadsheetId: string,
    ranges: string[],
    renderOption: ValueRenderOption = "UNFORMATTED_VALUE"
  ): Promise<string[][][]> {
    const consulta = ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join("&");
    const res = await this.chamar<LoteResposta>(
      `leitura de ${ranges.length} faixa(s)`,
      this.url(
        spreadsheetId,
        `/values:batchGet?${consulta}&valueRenderOption=${renderOption}&dateTimeRenderOption=FORMATTED_STRING`
      )
    );
    const porFaixa = res.valueRanges ?? [];
    return ranges.map((_, i) => toStringMatrix(porFaixa[i]?.values));
  }

  async batchUpdateValues(spreadsheetId: string, data: ValueRange[], valueInputOption: ValueInputOption) {
    if (data.length === 0) return;
    await this.chamar(`escrita de ${data.length} faixa(s)`, this.url(spreadsheetId, "/values:batchUpdate"), {
      method: "POST",
      body: JSON.stringify({ valueInputOption, data })
    });
  }

  async batchUpdate(spreadsheetId: string, requests: object[]) {
    if (requests.length === 0) return;
    await this.chamar(`${requests.length} operação(ões) estrutural(is)`, this.url(spreadsheetId, ":batchUpdate"), {
      method: "POST",
      body: JSON.stringify({ requests })
    });
  }
}
