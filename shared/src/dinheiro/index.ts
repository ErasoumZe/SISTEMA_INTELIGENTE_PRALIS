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

// Valor LIQUIDO de um lancamento, em centavos: o que de fato entrou/saiu.
//
// valor_original guarda o SUBTOTAL (na venda integrada e o VALOR_SUBTOTAL do CREARE), com desconto
// e acrescimo em colunas separadas. Somar valor_original puro superestima venda com desconto e
// subestima venda com acrescimo — era o que fazia o relatorio e o caixa nao baterem com o CREARE.
//
// Fonte unica: todo agregado de venda (relatorio, caixa, conciliacao) passa por aqui.
export function liquidoCentavos(valores: {
  valorOriginal: string | number | null | undefined;
  valorDesconto?: string | number | null | undefined;
  valorAcrescimo?: string | number | null | undefined;
}): number {
  return (
    paraCentavos(valores.valorOriginal) - paraCentavos(valores.valorDesconto) + paraCentavos(valores.valorAcrescimo)
  );
}

// Versao para agregados vindos do SQL: SOMA E LINEAR, entao somar as tres colunas separadamente e
// combinar aqui da exatamente SUM(original - desconto + acrescimo) — sem precisar de SQL cru.
export function liquidoDeSomasCentavos(somas: {
  somaOriginal: string | number | null | undefined;
  somaDesconto: string | number | null | undefined;
  somaAcrescimo: string | number | null | undefined;
}): number {
  return paraCentavos(somas.somaOriginal) - paraCentavos(somas.somaDesconto) + paraCentavos(somas.somaAcrescimo);
}

// Converte centavos inteiros para a string decimal gravada em colunas numeric do banco.
// Aritmetica inteira de ponta a ponta: nenhum float envolvido.
export function centavosParaDecimalBanco(centavos: number): string {
  const absoluto = Math.abs(Math.trunc(centavos));
  const inteiro = Math.trunc(absoluto / 100);
  const resto = absoluto % 100;
  const sinal = centavos < 0 ? "-" : "";
  return `${sinal}${inteiro}.${String(resto).padStart(2, "0")}`;
}
