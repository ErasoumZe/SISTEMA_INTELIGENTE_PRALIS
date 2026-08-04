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

/** Tipo do juros do lancamento (R-041). MESMA convencao do desconto: 'valor' e R$, 'percentual' e %. */
export const tiposJuros = ["percentual", "valor"] as const;
export type TipoJuros = (typeof tiposJuros)[number];

// O percentual NAO passa por paraCentavos: "2.5" ali viraria 250 (dois reais e cinquenta), e nao
// dois e meio por cento. Aqui ele e lido como numero de pontos percentuais, com ate 4 casas —
// a mesma precisao de juros_valor_informado (numeric(14,4)).
function pontosPercentuaisEmDezMilesimos(informado: string | number | null | undefined): number {
  const texto = String(informado ?? 0)
    .trim()
    .replace(",", ".");
  const numero = Number(texto);
  return Number.isFinite(numero) ? Math.round(numero * 10_000) : 0;
}

// JUROS do lancamento em CENTAVOS (R-041).
//
// 'valor'      -> o que a pessoa digitou JA E o R$.
// 'percentual' -> incide sobre o VALOR, nunca sobre o total (R-041). 1000 a 2% da 20,00 — se
//                 incidisse sobre o total seria juros sobre juros.
//
// Aritmetica inteira e UM arredondamento no fim: 333,33 a 2% = 666,66 decimos de centavo -> 6,67.
// Arredondar antes (ex.: converter o percentual para reais e so depois multiplicar) erraria o
// centavo, e centavo errado em juros vira divergencia entre a tela e o extrato.
export function jurosCentavos(entrada: {
  valorOriginal: string | number | null | undefined;
  jurosValorInformado?: string | number | null | undefined;
  jurosTipo?: TipoJuros | null | undefined;
}): number {
  if (!entrada.jurosTipo) return 0;
  if (entrada.jurosTipo === "valor") return Math.max(0, paraCentavos(entrada.jurosValorInformado));

  const base = paraCentavos(entrada.valorOriginal);
  const pontos = pontosPercentuaisEmDezMilesimos(entrada.jurosValorInformado);
  if (base <= 0 || pontos <= 0) return 0;
  // 10_000 (escala do percentual) * 100 (o "por cento") = 1_000_000.
  return Math.round((base * pontos) / 1_000_000);
}

// VALOR TOTAL do lancamento em CENTAVOS (R-042): Valor + Juros - Desconto.
//
// E a MESMA conta do liquidoCentavos, e tem de continuar sendo: valor_acrescimo guarda o juros ja
// convertido em R$ (ver o COMMENT da coluna na 0020), entao
//   liquidoCentavos(original, desconto, acrescimo) == valorTotalCentavos(...)
// Duas formulas de dinheiro que deveriam bater e nao batem e o defeito que o ADR-001 descreve.
//
// O desconto e OPCIONAL: a FOTO 2 mostra "Valor · Juros · Valor Total", e o desconto so aparece
// quando a discriminacao esta aberta.
export function valorTotalCentavos(entrada: {
  valorOriginal: string | number | null | undefined;
  jurosValorInformado?: string | number | null | undefined;
  jurosTipo?: TipoJuros | null | undefined;
  valorDesconto?: string | number | null | undefined;
}): number {
  const total = paraCentavos(entrada.valorOriginal) + jurosCentavos(entrada) - paraCentavos(entrada.valorDesconto);
  return Math.max(0, total);
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
