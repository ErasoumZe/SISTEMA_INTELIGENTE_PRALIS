import { idsGoogleConfigurados } from "./google-auth.js";
import {
  cabecalhoGoogle,
  executarGoogleJson,
  GoogleSheetHeaderError,
  obterTokenGoogle,
  type GoogleFetcher
} from "./google-errors.js";

type SpreadsheetValuesResponse = { values?: Array<Array<string | number | boolean | null>> };
type SpreadsheetMetadataResponse = { spreadsheetId?: string; properties?: { title?: string } };
type AppendResponse = { updatedRange?: string; updates?: { updatedRange?: string } };
export type GridDataCell = {
  userEnteredValue?: Record<string, string | number | boolean | null>;
  effectiveValue?: Record<string, string | number | boolean | null>;
  dataValidation?: Record<string, string | number | boolean | null>;
};
export type GoogleSheetGrid = {
  sheets?: Array<{
    properties?: { title?: string; sheetId?: number };
    merges?: Array<{
      startRowIndex?: number;
      endRowIndex?: number;
      startColumnIndex?: number;
      endColumnIndex?: number;
    }>;
    protectedRanges?: Array<{
      range?: {
        sheetId?: number;
        startRowIndex?: number;
        endRowIndex?: number;
        startColumnIndex?: number;
        endColumnIndex?: number;
      };
      description?: string;
    }>;
    data?: Array<{ rowData?: Array<{ values?: GridDataCell[] }> }>;
  }>;
};

export type GoogleSheetsServiceOptions = {
  fetcher?: GoogleFetcher;
  tokenProvider?: () => Promise<string>;
  spreadsheetId?: string;
};

export type RegistroPorCabecalho = Record<string, string | number | boolean | null>;
export type AtualizacaoGoogleCelula = {
  coluna: number;
  valor: string | number | boolean;
};

export function normalizarTituloPlanilha(valor: string): string {
  return valor.normalize("NFC").replace(/\s+/gu, " ").trim();
}

function fetcherPadrao(input: string, init?: RequestInit): Promise<Response> {
  return fetch(input, init);
}

function colunaParaA1(indice: number): string {
  let valor = indice + 1;
  let resultado = "";
  while (valor > 0) {
    const resto = (valor - 1) % 26;
    resultado = String.fromCharCode(65 + resto) + resultado;
    valor = Math.floor((valor - 1) / 26);
  }
  return resultado;
}

function celulaOcupada(cell: GridDataCell | undefined): boolean {
  return (
    Boolean(cell?.userEnteredValue && Object.keys(cell.userEnteredValue).length > 0) ||
    Boolean(cell?.effectiveValue && Object.keys(cell.effectiveValue).length > 0)
  );
}

export function normalizarCabecalho(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replaceAll("\n", " ")
    .replace(/\s+/gu, " ")
    .replace(/[;,.]+$/u, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

export function prepararRegistroPorCabecalho(
  cabecalhos: readonly string[],
  valores: RegistroPorCabecalho
): Array<string | number | boolean | null> {
  const valoresNormalizados = new Map(
    Object.entries(valores).map(([chave, valor]) => [normalizarCabecalho(chave), valor] as const)
  );
  return cabecalhos.map((cabecalho) => valoresNormalizados.get(normalizarCabecalho(cabecalho)) ?? null);
}

export function encontrarLinhaCabecalho(
  linhas: readonly (readonly (string | number | boolean | null)[])[],
  cabecalhoObrigatorio: string
): { indice: number; cabecalhos: string[] } {
  const alvo = normalizarCabecalho(cabecalhoObrigatorio);
  const indice = linhas.findIndex((linha) =>
    linha.some((celula) => typeof celula === "string" && normalizarCabecalho(celula) === alvo)
  );
  if (indice < 0) throw new Error("Cabecalho obrigatorio nao encontrado na planilha");
  return {
    indice,
    cabecalhos: (linhas[indice] ?? []).map((celula) => (celula === null ? "" : String(celula)))
  };
}

export function validarCabecalhos(
  cabecalhos: readonly string[],
  obrigatorios: readonly string[]
): { colunas: ReadonlyMap<string, number> } {
  const colunas = new Map<string, number>();
  const duplicados = new Set<string>();
  cabecalhos.forEach((cabecalho, indice) => {
    const normalizado = normalizarCabecalho(cabecalho);
    if (!normalizado) return;
    if (colunas.has(normalizado)) duplicados.add(cabecalho.trim());
    else colunas.set(normalizado, indice);
  });
  const faltantes = obrigatorios.filter((cabecalho) => !colunas.has(normalizarCabecalho(cabecalho)));
  if (faltantes.length > 0 || duplicados.size > 0) {
    throw new GoogleSheetHeaderError(faltantes, [...duplicados]);
  }
  return { colunas };
}

export class GoogleSheetsService {
  private readonly fetcher: GoogleFetcher;
  private readonly tokenProvider: () => Promise<string>;
  private readonly spreadsheetId: string;

  constructor(opcoes: GoogleSheetsServiceOptions = {}) {
    this.fetcher = opcoes.fetcher ?? fetcherPadrao;
    this.tokenProvider = opcoes.tokenProvider ?? obterTokenGoogle;
    this.spreadsheetId = opcoes.spreadsheetId ?? idsGoogleConfigurados().spreadsheetId;
  }

  async lerLinhasParaCabecalho(sheetName: string, range = "A1:ZZ20") {
    const token = await this.tokenProvider();
    const resposta = await executarGoogleJson<SpreadsheetValuesResponse>(
      this.fetcher,
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(this.spreadsheetId)}/values/${encodeURIComponent(`${sheetName}!${range}`)}`,
      { headers: cabecalhoGoogle(token) },
      "ler estrutura da planilha"
    );
    return resposta.values ?? [];
  }

  /**
   * Varias faixas numa chamada so (`values:batchGet`), com o valor FORMATADO — como o app oficial le as
   * abas fiscais. Uma faixa fora da grade derruba o lote inteiro; quem chama decide o que reler.
   */
  async lerFaixasEmLote(faixas: string[]): Promise<string[][][]> {
    const token = await this.tokenProvider();
    const consulta = faixas.map((faixa) => `ranges=${encodeURIComponent(faixa)}`).join("&");
    const resposta = await executarGoogleJson<{ valueRanges?: SpreadsheetValuesResponse[] }>(
      this.fetcher,
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(this.spreadsheetId)}/values:batchGet?${consulta}&valueRenderOption=FORMATTED_VALUE`,
      { headers: cabecalhoGoogle(token) },
      "ler faixas da planilha"
    );
    return (resposta.valueRanges ?? []).map((faixa) =>
      (faixa.values ?? []).map((linha) => linha.map((valor) => (valor == null ? "" : String(valor))))
    );
  }

  async lerLinhas(sheetName: string, range = "A:ZZ") {
    return this.lerLinhasParaCabecalho(sheetName, range);
  }

  async lerGrade(sheetName: string, range: string): Promise<GoogleSheetGrid> {
    const token = await this.tokenProvider();
    return executarGoogleJson<GoogleSheetGrid>(
      this.fetcher,
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(this.spreadsheetId)}?includeGridData=true&fields=sheets(properties,merges,protectedRanges,data(rowData(values(userEnteredValue,effectiveValue,dataValidation))))&ranges=${encodeURIComponent(`${sheetName}!${range}`)}`,
      { headers: cabecalhoGoogle(token) },
      "ler estrutura das linhas da planilha"
    );
  }

  async atualizarValores(
    sheetName: string,
    range: string,
    valores: Array<Array<string | number | boolean | null>>
  ): Promise<{ updatedRange: string | null }> {
    const token = await this.tokenProvider();
    const resposta = await executarGoogleJson<AppendResponse>(
      this.fetcher,
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(this.spreadsheetId)}/values/${encodeURIComponent(`${sheetName}!${range}`)}?valueInputOption=RAW&includeValuesInResponse=false`,
      {
        method: "PUT",
        headers: cabecalhoGoogle(token, "application/json"),
        body: JSON.stringify({ values: valores })
      },
      "atualizar valores da planilha"
    );
    return { updatedRange: resposta.updatedRange ?? resposta.updates?.updatedRange ?? null };
  }

  async atualizarValoresEmLote(
    atualizacoes: Array<{ range: string; valores: Array<Array<string | number | boolean | null>> }>
  ): Promise<void> {
    const token = await this.tokenProvider();
    await executarGoogleJson(
      this.fetcher,
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(this.spreadsheetId)}/values:batchUpdate`,
      {
        method: "POST",
        headers: cabecalhoGoogle(token, "application/json"),
        body: JSON.stringify({
          valueInputOption: "RAW",
          data: atualizacoes.map(({ range, valores }) => ({ range, values: valores }))
        })
      },
      "atualizar faixas da planilha"
    );
  }

  async limparValores(sheetName: string, range: string): Promise<void> {
    const token = await this.tokenProvider();
    await executarGoogleJson(
      this.fetcher,
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(this.spreadsheetId)}/values/${encodeURIComponent(`${sheetName}!${range}`)}:clear`,
      {
        method: "POST",
        headers: cabecalhoGoogle(token, "application/json"),
        body: "{}"
      },
      "limpar valores da planilha"
    );
  }

  async limparValoresEmLote(ranges: string[]): Promise<void> {
    const token = await this.tokenProvider();
    await executarGoogleJson(
      this.fetcher,
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(this.spreadsheetId)}/values:batchClear`,
      {
        method: "POST",
        headers: cabecalhoGoogle(token, "application/json"),
        body: JSON.stringify({ ranges })
      },
      "limpar faixas da planilha"
    );
  }

  async lerCabecalhos(sheetName: string, headerRow: number, endColumn = "ZZ"): Promise<string[]> {
    const linhas = await this.lerLinhasParaCabecalho(sheetName, `A${headerRow}:${endColumn}${headerRow}`);
    return (linhas[0] ?? []).map((celula) => (celula === null ? "" : String(celula)));
  }

  async validarIdentidade(tituloEsperado: string): Promise<void> {
    const token = await this.tokenProvider();
    const metadata = await executarGoogleJson<SpreadsheetMetadataResponse>(
      this.fetcher,
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(this.spreadsheetId)}?fields=spreadsheetId,properties.title`,
      { headers: cabecalhoGoogle(token) },
      "validar identidade da planilha"
    );
    if (
      metadata.spreadsheetId !== this.spreadsheetId ||
      normalizarTituloPlanilha(metadata.properties?.title ?? "") !== normalizarTituloPlanilha(tituloEsperado)
    ) {
      throw new Error("A planilha configurada nao corresponde ao destino autorizado");
    }
  }

  async inserirRegistroSemSobrescrever(
    sheetName: string,
    cabecalhos: readonly string[],
    valores: RegistroPorCabecalho
  ): Promise<{ updatedRange: string | null }> {
    const linha = prepararRegistroPorCabecalho(cabecalhos, valores);
    const token = await this.tokenProvider();
    const resposta = await executarGoogleJson<AppendResponse>(
      this.fetcher,
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(this.spreadsheetId)}/values/${encodeURIComponent(`${sheetName}!A:A`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS&includeValuesInResponse=false`,
      {
        method: "POST",
        headers: cabecalhoGoogle(token, "application/json"),
        body: JSON.stringify({ values: [linha] })
      },
      "inserir registro na planilha"
    );
    return { updatedRange: resposta.updates?.updatedRange ?? null };
  }

  async inserirLinhaSemSobrescrever(
    sheetName: string,
    linha: Array<string | number | boolean | null>,
    primeiraLinha = 1
  ): Promise<{ updatedRange: string | null }> {
    if (!Number.isInteger(primeiraLinha) || primeiraLinha < 1) {
      throw new Error("A primeira linha da planilha deve ser um inteiro positivo");
    }
    if (primeiraLinha === 1) return this.inserirLinhaPorAppend(sheetName, linha);

    const ultimaColuna = colunaParaA1(Math.max(linha.length - 1, 0));
    const token = await this.tokenProvider();
    const leitura = await executarGoogleJson<GoogleSheetGrid>(
      this.fetcher,
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(this.spreadsheetId)}?includeGridData=true&fields=sheets(data(rowData(values(userEnteredValue,effectiveValue))))&ranges=${encodeURIComponent(`${sheetName}!A${primeiraLinha}:ZZ`)}`,
      { headers: cabecalhoGoogle(token) },
      "verificar linha disponível na planilha"
    );
    const linhas = leitura.sheets?.[0]?.data?.[0]?.rowData ?? [];
    const offset = linhas.findIndex((row) => !(row.values ?? []).some((cell) => celulaOcupada(cell)));
    const linhaDestino = offset < 0 ? primeiraLinha + linhas.length : primeiraLinha + offset;
    const resposta = await executarGoogleJson<AppendResponse>(
      this.fetcher,
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(this.spreadsheetId)}/values/${encodeURIComponent(`${sheetName}!A${linhaDestino}:${ultimaColuna}${linhaDestino}`)}?valueInputOption=RAW&includeValuesInResponse=false`,
      {
        method: "PUT",
        headers: cabecalhoGoogle(token, "application/json"),
        body: JSON.stringify({ values: [linha] })
      },
      "inserir registro na linha disponível da planilha"
    );
    return {
      updatedRange:
        resposta.updatedRange ??
        resposta.updates?.updatedRange ??
        `${sheetName}!A${linhaDestino}:${ultimaColuna}${linhaDestino}`
    };
  }

  /**
   * Insere somente células conhecidas em uma linha vazia. A operação é preparada para preservar
   * fórmulas e campos internos: valores ausentes nunca são enviados como null. Uma célula mesclada
   * que intersecte o destino é recusada antes de qualquer escrita.
   */
  async inserirAtualizacoesSemSobrescrever(
    sheetName: string,
    atualizacoes: readonly AtualizacaoGoogleCelula[],
    primeiraLinha = 1,
    linhaEsperada?: number,
    considerarEstruturaSegura = false
  ): Promise<{ linha: number; ranges: string[] }> {
    if (!atualizacoes.length) throw new Error("Nenhuma célula autorizada para sincronização");
    if (!Number.isInteger(primeiraLinha) || primeiraLinha < 1) throw new Error("Linha inicial inválida");

    const grade = await this.lerGrade(sheetName, `A${primeiraLinha}:ZZ`);
    const dadosAba = grade.sheets?.[0];
    const linhas = dadosAba?.data?.[0]?.rowData ?? [];
    const offset = linhas.findIndex((row, indice) => {
      if ((row.values ?? []).some((cell) => celulaOcupada(cell))) return false;
      if (!considerarEstruturaSegura) return true;
      const linhaAtual = primeiraLinha + indice;
      const linhaZeroBased = linhaAtual - 1;
      const linhaMesclada = (dadosAba?.merges ?? []).some(
        (mesclagem) => linhaZeroBased >= (mesclagem.startRowIndex ?? 0) && linhaZeroBased < (mesclagem.endRowIndex ?? 0)
      );
      if (linhaMesclada) return false;
      return !(dadosAba?.protectedRanges ?? []).some((protecao) => {
        const faixa = protecao.range;
        return (
          linhaZeroBased >= (faixa?.startRowIndex ?? 0) &&
          linhaZeroBased < (faixa?.endRowIndex ?? Number.MAX_SAFE_INTEGER) &&
          atualizacoes.some(
            ({ coluna }) =>
              coluna >= (faixa?.startColumnIndex ?? 0) && coluna < (faixa?.endColumnIndex ?? Number.MAX_SAFE_INTEGER)
          )
        );
      });
    });
    const linha = primeiraLinha + (offset < 0 ? linhas.length : offset);
    if (linhaEsperada !== undefined && linha !== linhaEsperada) {
      throw new Error("A linha segura mudou antes da gravação; sincronização abortada");
    }
    const linhaZeroBased = linha - 1;

    for (const mesclagem of dadosAba?.merges ?? []) {
      const cobreLinha =
        linhaZeroBased >= (mesclagem.startRowIndex ?? 0) && linhaZeroBased < (mesclagem.endRowIndex ?? 0);
      if (!cobreLinha) continue;
      const interfere = atualizacoes.some(
        ({ coluna }) => coluna >= (mesclagem.startColumnIndex ?? 0) && coluna < (mesclagem.endColumnIndex ?? 0)
      );
      if (interfere) throw new Error("A linha disponível contém célula mesclada no destino da sincronização");
    }

    const ranges = atualizacoes.map(({ coluna, valor }) => ({
      range: `${sheetName}!${colunaParaA1(coluna)}${linha}`,
      valores: [[valor]]
    }));
    await this.atualizarValoresEmLote(ranges);
    return { linha, ranges: ranges.map(({ range }) => range) };
  }

  private async inserirLinhaPorAppend(
    sheetName: string,
    linha: Array<string | number | boolean | null>
  ): Promise<{ updatedRange: string | null }> {
    const token = await this.tokenProvider();
    const resposta = await executarGoogleJson<AppendResponse>(
      this.fetcher,
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(this.spreadsheetId)}/values/${encodeURIComponent(`${sheetName}!A:A`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS&includeValuesInResponse=false`,
      {
        method: "POST",
        headers: cabecalhoGoogle(token, "application/json"),
        body: JSON.stringify({ values: [linha] })
      },
      "inserir linha na planilha"
    );
    return { updatedRange: resposta.updates?.updatedRange ?? null };
  }
}
