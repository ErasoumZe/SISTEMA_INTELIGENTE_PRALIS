import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { GoogleSheetsService, normalizarCabecalho } from "../api/src/google/google-sheets.service.js";
import { idsGoogleConfigurados } from "../api/src/google/google-auth.js";
import {
  faixasNaoVazias,
  intervaloAfetaFaixas,
  mesmaLinha,
  naoVazio,
  type GoogleSheetCellValue
} from "../api/src/google/google-sheet-move.js";

const SHEET = "colab.tnp (filter)";
const DEPENDENTS_SHEET = "dependentes.tnp (filter)";
const TEST_ID = "ficticio-001";
const SOURCE_ROW = 6;
const TARGET_ROW = 12;
const END_COLUMN = "BB";
const TEST_PROCESS_ID = `TESTE-${TEST_ID}`;
const TEST_NAME = "Colaborador Ficticio do Teste";

type CellValue = GoogleSheetCellValue;

function colunaA1(indice: number): string {
  let valor = indice + 1;
  let resultado = "";
  while (valor > 0) {
    resultado = String.fromCharCode(65 + ((valor - 1) % 26)) + resultado;
    valor = Math.floor((valor - 1) / 26);
  }
  return resultado;
}

function preencherLinha(linha: readonly CellValue[] | undefined, quantidade: number): CellValue[] {
  return Array.from({ length: quantidade }, (_, indice) => linha?.[indice] ?? null);
}

function possuiFormula(grid: Awaited<ReturnType<GoogleSheetsService["lerGrade"]>>, indiceLinha: number): boolean {
  const sheet = grid.sheets?.[0];
  const row = sheet?.data?.[0]?.rowData?.[indiceLinha];
  return (row?.values ?? []).some((cell) => typeof cell.userEnteredValue?.["formula"] === "string");
}

function interseccionaLinha(
  intervalo:
    | { startRowIndex?: number; endRowIndex?: number; startColumnIndex?: number; endColumnIndex?: number }
    | undefined,
  linha: number,
  ultimaColuna: number
): boolean {
  if (!intervalo) return false;
  const inicioLinha = intervalo.startRowIndex ?? 0;
  const fimLinha = intervalo.endRowIndex ?? Number.MAX_SAFE_INTEGER;
  const inicioColuna = intervalo.startColumnIndex ?? 0;
  const fimColuna = intervalo.endColumnIndex ?? Number.MAX_SAFE_INTEGER;
  return inicioLinha <= linha && linha < fimLinha && inicioColuna < ultimaColuna && fimColuna > 0;
}

function validarEstruturaSegura(
  grid: Awaited<ReturnType<GoogleSheetsService["lerGrade"]>>,
  source: readonly CellValue[],
  target: readonly CellValue[],
  faixas: Array<[number, number]>
): void {
  if (target.some(naoVazio)) throw new Error("A linha 12 nao esta vazia; movimentacao interrompida");
  if (possuiFormula(grid, SOURCE_ROW - 1) || possuiFormula(grid, TARGET_ROW - 1)) {
    throw new Error("Foi encontrada formula na origem ou destino; movimentacao interrompida");
  }
  const sheet = grid.sheets?.[0];
  if (
    (sheet?.merges ?? []).some(
      (merge) =>
        (interseccionaLinha(merge, SOURCE_ROW - 1, 54) && intervaloAfetaFaixas(merge, faixas)) ||
        (interseccionaLinha(merge, TARGET_ROW - 1, 54) && intervaloAfetaFaixas(merge, faixas))
    )
  ) {
    throw new Error("Foi encontrada mesclagem na origem ou destino; movimentacao interrompida");
  }
  if (
    (sheet?.protectedRanges ?? []).some(
      (protectedRange) =>
        (interseccionaLinha(protectedRange.range, SOURCE_ROW - 1, 54) &&
          intervaloAfetaFaixas(protectedRange.range, faixas)) ||
        (interseccionaLinha(protectedRange.range, TARGET_ROW - 1, 54) &&
          intervaloAfetaFaixas(protectedRange.range, faixas))
    )
  ) {
    throw new Error("Foi encontrada protecao na origem ou destino; movimentacao interrompida");
  }
  if (!source.some((valor) => String(valor ?? "") === TEST_PROCESS_ID)) {
    throw new Error("O registro ficticio nao foi localizado na linha 6");
  }
  if (!source.some((valor) => String(valor ?? "") === TEST_NAME)) {
    throw new Error("O nome esperado do teste nao foi localizado na linha 6");
  }
  const links = source.flatMap((valor) => String(valor ?? "").match(/https?:\/\/[^\s]+/giu) ?? []);
  if (links.length !== 12) throw new Error("A linha 6 nao possui exatamente 12 links do teste");
}

if (process.env["NODE_ENV"] === "production" || process.env["PRALIS_GOOGLE_MOVIMENTO_CONFIRMADO"] !== "SIM") {
  throw new Error("Movimentacao recusada: exige desenvolvimento e confirmacao explicita");
}
if (!process.argv.includes("--confirmar-movimentacao")) {
  throw new Error("Movimentacao recusada: use --confirmar-movimentacao");
}

const sheets = new GoogleSheetsService();
const ids = idsGoogleConfigurados();
await sheets.validarIdentidade("CICLUZ GP - TNP - LANÇAMENTOS GESTÃO DE PESSOAS (DES)");
const cabecalhos = preencherLinha((await sheets.lerLinhasParaCabecalho(SHEET, `A5:${END_COLUMN}5`))[0], 54);
if (!cabecalhos.some((valor) => normalizarCabecalho(String(valor ?? "")) === "nome completo")) {
  throw new Error("Cabecalho de colaboradores nao encontrado na linha 5");
}
const origem = preencherLinha(
  (await sheets.lerLinhasParaCabecalho(SHEET, `A${SOURCE_ROW}:${END_COLUMN}${SOURCE_ROW}`))[0],
  54
);
const destino = preencherLinha(
  (await sheets.lerLinhasParaCabecalho(SHEET, `A${TARGET_ROW}:${END_COLUMN}${TARGET_ROW}`))[0],
  54
);
const dependentesAntes = preencherLinha((await sheets.lerLinhasParaCabecalho(DEPENDENTS_SHEET, "A2:I2"))[0], 9);
const grid = await sheets.lerGrade(SHEET, `A1:${END_COLUMN}15`);
const faixas = faixasNaoVazias(origem);
validarEstruturaSegura(grid, origem, destino, faixas);

const backupPath = `backups/google/google-move-${TEST_ID}-${new Date().toISOString().replace(/[:.]/gu, "-")}.json`;
await mkdir("backups/google", { recursive: true });
await writeFile(
  backupPath,
  JSON.stringify(
    {
      spreadsheetId: ids.spreadsheetId,
      sheet: SHEET,
      sourceRow: SOURCE_ROW,
      targetRow: TARGET_ROW,
      headers: cabecalhos,
      sourceValues: origem,
      targetValues: destino,
      dependentRow2: dependentesAntes,
      createdAt: new Date().toISOString()
    },
    null,
    2
  ),
  "utf8"
);

await sheets.atualizarValoresEmLote(
  faixas.map(([inicio, fim]) => ({
    range: `${SHEET}!${colunaA1(inicio)}${TARGET_ROW}:${colunaA1(fim)}${TARGET_ROW}`,
    valores: [origem.slice(inicio, fim + 1)]
  }))
);
const destinoDepois = preencherLinha(
  (await sheets.lerLinhasParaCabecalho(SHEET, `A${TARGET_ROW}:${END_COLUMN}${TARGET_ROW}`))[0],
  54
);
if (!mesmaLinha(origem, destinoDepois)) {
  throw new Error("A verificacao da linha 12 divergiu; a linha 6 nao foi limpa");
}

await sheets.limparValoresEmLote(
  faixas.map(([inicio, fim]) => `${SHEET}!${colunaA1(inicio)}${SOURCE_ROW}:${colunaA1(fim)}${SOURCE_ROW}`)
);

const origemDepois = preencherLinha(
  (await sheets.lerLinhasParaCabecalho(SHEET, `A${SOURCE_ROW}:${END_COLUMN}${SOURCE_ROW}`))[0],
  54
);
const dependentesDepois = preencherLinha((await sheets.lerLinhasParaCabecalho(DEPENDENTS_SHEET, "A2:I2"))[0], 9);
if (origemDepois.some(naoVazio)) throw new Error("A linha 6 ainda possui valores apos a limpeza");
if (!mesmaLinha(dependentesAntes, dependentesDepois)) throw new Error("A linha do dependente foi alterada");

console.info(
  JSON.stringify(
    {
      status: "SUCESSO",
      spreadsheetIdExact: true,
      sourceRow: SOURCE_ROW,
      targetRow: TARGET_ROW,
      linksPreserved: destinoDepois.filter((valor) => /https?:\/\//iu.test(String(valor ?? ""))).length,
      sourceCleared: true,
      dependentRow2Preserved: true,
      backupPath,
      noDriveWrites: true
    },
    null,
    2
  )
);
