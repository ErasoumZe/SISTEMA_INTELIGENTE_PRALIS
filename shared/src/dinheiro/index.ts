export function paraCentavos(valor: string | number | null | undefined): number {
  const texto = String(valor ?? 0).trim();
  if (!texto) return 0;
  const negativo = texto.startsWith("-");
  const normalizado = (negativo ? texto.slice(1) : texto).replace(",", ".");
  const [inteiroRaw = "0", decimalRaw = ""] = normalizado.split(".");
  const inteiro = Number.parseInt(inteiroRaw.replace(/\D/g, "") || "0", 10);
  const decimal = Number.parseInt(decimalRaw.padEnd(2, "0").slice(0, 2), 10) || 0;
  const centavos = inteiro * 100 + decimal;
  return negativo ? -centavos : centavos;
}

export function deCentavos(centavos: number): number {
  return centavos / 100;
}

export function somarCentavos(...valores: Array<string | number | null | undefined>): number {
  return valores.reduce<number>((total, valor) => total + paraCentavos(valor), 0);
}

export function formatarDecimalBanco(valor: string | number | null | undefined): string {
  return deCentavos(paraCentavos(valor)).toFixed(2);
}
