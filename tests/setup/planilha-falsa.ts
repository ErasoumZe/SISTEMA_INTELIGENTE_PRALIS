import {
  colToIndex,
  indexToCol,
  type SheetMeta,
  type SheetsGateway,
  type ValueInputOption,
  type ValueRange,
  type ValueRenderOption
} from "../../api/src/google/google-sheets-gateway.js";

/**
 * Planilha Google em memoria para o escritor do espelho (R-222). Cada aba e uma grade de strings; formula e
 * a string que comeca com "=". Guarda as chamadas para o teste conferir a ordem e o tipo de escrita.
 */
interface Aba {
  meta: SheetMeta;
  celulas: Map<string, string>;
}

type Faixa = { linha: number; coluna: number };

const chave = (linha: number, coluna: number) => `${linha}:${coluna}`;

function lerCelula(ref: string): Faixa & { soColuna: boolean } {
  const achado = /^([A-Z]+)(\d*)$/u.exec(ref);
  if (!achado) throw new Error(`Referencia invalida: ${ref}`);
  return { coluna: colToIndex(achado[1]!), linha: achado[2] ? Number(achado[2]) : 0, soColuna: !achado[2] };
}

export class PlanilhaFalsa implements SheetsGateway {
  readonly abas = new Map<string, Aba>();
  readonly chamadas: Array<{ tipo: string; detalhe: string }> = [];

  criarAba(titulo: string, linhas: Record<number, Record<string, string>>, rowCount: number, columnCount = 26) {
    const celulas = new Map<string, string>();
    for (const [linha, colunas] of Object.entries(linhas)) {
      for (const [coluna, valor] of Object.entries(colunas))
        celulas.set(chave(Number(linha), colToIndex(coluna)), valor);
    }
    this.abas.set(titulo, { meta: { sheetId: this.abas.size + 1, title: titulo, rowCount, columnCount }, celulas });
  }

  valor(titulo: string, ref: string): string {
    const { linha, coluna } = lerCelula(ref);
    return this.abas.get(titulo)?.celulas.get(chave(linha, coluna)) ?? "";
  }

  private faixa(a1: string): { aba: Aba; de: Faixa; ate: Faixa } {
    const separador = a1.lastIndexOf("!");
    const titulo = a1.slice(1, separador - 1).replaceAll("''", "'");
    const aba = this.abas.get(titulo);
    if (!aba) throw new Error(`Aba inexistente: ${titulo}`);
    const [inicio, fim = inicio] = a1.slice(separador + 1).split(":");
    const de = lerCelula(inicio!);
    const ate = lerCelula(fim!);
    return { aba, de, ate: { coluna: ate.coluna, linha: ate.soColuna ? aba.meta.rowCount : ate.linha } };
  }

  async getSheets(): Promise<SheetMeta[]> {
    return [...this.abas.values()].map((aba) => ({ ...aba.meta }));
  }

  async batchGetValues(_id: string, ranges: string[], render: ValueRenderOption = "UNFORMATTED_VALUE") {
    return ranges.map((range) => {
      const { aba, de, ate } = this.faixa(range);
      const linhas: string[][] = [];
      for (let l = de.linha; l <= ate.linha; l += 1) {
        const linha: string[] = [];
        for (let c = de.coluna; c <= ate.coluna; c += 1) {
          const v = aba.celulas.get(chave(l, c)) ?? "";
          linha.push(render !== "FORMULA" && v.startsWith("=") ? "calculado" : v);
        }
        linhas.push(linha);
      }
      // O Sheets corta as linhas vazias do fim.
      while (linhas.length && linhas[linhas.length - 1]!.every((v) => v === "")) linhas.pop();
      return linhas;
    });
  }

  async batchUpdateValues(_id: string, data: ValueRange[], modo: ValueInputOption) {
    for (const { range, values } of data) {
      const { aba, de } = this.faixa(range);
      if (de.linha > aba.meta.rowCount) throw new Error(`Fora da grade: ${range}`);
      this.chamadas.push({ tipo: modo, detalhe: `${range}=${String(values[0]?.[0])}` });
      aba.celulas.set(chave(de.linha, de.coluna), String(values[0]?.[0] ?? ""));
    }
  }

  async batchUpdate(_id: string, requests: object[]) {
    for (const pedido of requests as Array<Record<string, Record<string, unknown>>>) {
      if (pedido["appendDimension"]) {
        const { sheetId, length } = pedido["appendDimension"] as { sheetId: number; length: number };
        const aba = [...this.abas.values()].find((a) => a.meta.sheetId === sheetId)!;
        aba.meta.rowCount += length;
        this.chamadas.push({ tipo: "appendDimension", detalhe: `${aba.meta.title}+${length}` });
      }
      const copia = pedido["copyPaste"] as
        | { source: Record<string, number>; destination: Record<string, number>; pasteType: string }
        | undefined;
      if (copia) {
        const aba = [...this.abas.values()].find((a) => a.meta.sheetId === copia.source["sheetId"])!;
        const origem = copia.source["startRowIndex"]! + 1;
        const destino = copia.destination["startRowIndex"]! + 1;
        this.chamadas.push({ tipo: copia.pasteType, detalhe: `${origem}->${destino}` });
        if (copia.pasteType !== "PASTE_FORMULA") continue;
        for (let c = copia.source["startColumnIndex"]!; c < copia.source["endColumnIndex"]!; c += 1) {
          const v = aba.celulas.get(chave(origem, c));
          if (v?.startsWith("=")) aba.celulas.set(chave(destino, c), v.replaceAll(String(origem), String(destino)));
        }
      }
    }
  }
}

export { indexToCol };
