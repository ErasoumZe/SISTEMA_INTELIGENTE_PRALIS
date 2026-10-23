export type GoogleSheetCellValue = string | number | boolean | null;

export function naoVazio(valor: GoogleSheetCellValue): boolean {
  return valor !== null && String(valor).trim() !== "";
}

export function faixasNaoVazias(linha: readonly GoogleSheetCellValue[]): Array<[number, number]> {
  const faixas: Array<[number, number]> = [];
  let inicio: number | undefined;
  for (let indice = 0; indice <= linha.length; indice += 1) {
    if (indice < linha.length && naoVazio(linha[indice] ?? null)) {
      inicio ??= indice;
      continue;
    }
    if (inicio !== undefined) {
      faixas.push([inicio, indice - 1]);
      inicio = undefined;
    }
  }
  return faixas;
}

export function mesmaLinha(a: readonly GoogleSheetCellValue[], b: readonly GoogleSheetCellValue[]): boolean {
  return a.length === b.length && a.every((valor, indice) => valor === b[indice]);
}

export function intervaloAfetaFaixas(
  intervalo: { startColumnIndex?: number; endColumnIndex?: number } | undefined,
  faixas: readonly (readonly [number, number])[]
): boolean {
  const inicio = intervalo?.startColumnIndex ?? 0;
  const fim = intervalo?.endColumnIndex ?? Number.MAX_SAFE_INTEGER;
  return faixas.some(([faixaInicio, faixaFim]) => inicio <= faixaFim && fim > faixaInicio);
}
