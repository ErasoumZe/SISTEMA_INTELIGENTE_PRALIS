export function normalizarTextoPlanilha(valor: string | undefined): string {
  return (valor ?? "")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function ehTotalizadorPlanilha(valor: string): boolean {
  return normalizarTextoPlanilha(valor).toUpperCase().startsWith("TOTAL ");
}
