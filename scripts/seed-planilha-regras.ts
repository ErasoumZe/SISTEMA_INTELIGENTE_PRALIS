export function normalizarTextoPlanilha(valor: string | undefined): string {
  return (valor ?? "")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function ehTotalizadorPlanilha(valor: string): boolean {
  return normalizarTextoPlanilha(valor).toUpperCase().startsWith("TOTAL ");
}

/**
 * Numero da planilha em formato pt-BR ("1.234,5") para numero. Devolve `null` quando a celula esta
 * vazia ou nao e numero — e a diferenca entre "o Rodrigo nao informou" e "informou zero", que o
 * relatorio precisa distinguir.
 */
export function numeroDaPlanilha(bruto: string | undefined): number | null {
  const texto = normalizarTextoPlanilha(bruto);
  if (!texto) return null;
  const numero = Number(texto.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(numero) ? numero : null;
}

/**
 * Sigla de unidade, normalizada para casar com o cadastro de Unidades: sem acento, sem espaco e em
 * MAIUSCULA. A planilha tem "kg", "KG" e "Kg" na mesma coluna.
 */
export function siglaDeUnidade(bruto: string | undefined): string {
  return normalizarTextoPlanilha(bruto).replace(/\s+/g, "").toUpperCase();
}

export interface EstoqueDaPlanilha {
  minimo: number | null;
  maximo: number | null;
  /** `true` quando o maximo e MENOR que o minimo — dado incoerente que precisa aparecer no relatorio. */
  invertido: boolean;
}

/**
 * Estoque minimo e maximo. Nao "corrige" o inverso: marca. Trocar os dois em silencio esconderia
 * um erro de digitacao da planilha, e o pedido automatico dispararia pela quantidade errada.
 */
export function estoqueDaPlanilha(minimoBruto: string | undefined, maximoBruto: string | undefined): EstoqueDaPlanilha {
  const minimo = numeroDaPlanilha(minimoBruto);
  const maximo = numeroDaPlanilha(maximoBruto);
  return { minimo, maximo, invertido: minimo != null && maximo != null && maximo < minimo };
}

/** Duplicidades dentro da propria planilha, por uma chave qualquer. Devolve so as chaves repetidas. */
export function chavesRepetidas<T>(itens: readonly T[], chave: (item: T) => string): Map<string, number> {
  const contagem = new Map<string, number>();
  for (const item of itens) {
    const valor = chave(item);
    if (!valor) continue;
    contagem.set(valor, (contagem.get(valor) ?? 0) + 1);
  }
  return new Map([...contagem].filter(([, quantas]) => quantas > 1));
}
