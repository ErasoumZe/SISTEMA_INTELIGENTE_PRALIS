/**
 * Números do formulário de produto — o mesmo comportamento do cadastro paralelo (app da loja).
 *
 * Funções puras: não dependem de Vue nem de rede, e por isso têm teste próprio
 * (`produto-numeros.test.ts`). Quem mexe na regra mexe aqui, num lugar só.
 */

/**
 * Texto da tela → número. Vazio (ou texto que não é número) é AUSÊNCIA, nunca zero: zero é uma
 * afirmação. `Number("")` dá 0, e era assim que custo, preço e estoque em branco iam como 0 para o
 * servidor (paralelo: `Number(x) || null`). Aceita vírgula, que é o que sai do teclado em pt-BR.
 */
export function numeroDigitado(texto: string | number | null | undefined): number | null {
  if (texto == null) return null;
  const limpo = String(texto).trim().replace(",", ".");
  if (limpo === "") return null;
  const valor = Number(limpo);
  return Number.isFinite(valor) ? valor : null;
}

/**
 * Número que vem do banco, sem as casas que só o banco guarda: "25.000" → "25", "12.500" → "12.5".
 * Vazio continua vazio; texto que não é número volta como veio (não some com o que está gravado).
 */
export function textoDeNumero(valor: string | number | null | undefined): string {
  if (valor == null || String(valor).trim() === "") return "";
  const convertido = numeroDigitado(valor);
  return convertido == null ? String(valor) : String(convertido);
}

/**
 * Fração do domínio → percentual da tela, arredondado na 2ª casa do PERCENTUAL, como o
 * `fracaoParaMargemPct` do paralelo. Sem isto, 0.29 aparecia como "28.999999999999996".
 */
export function fracaoParaPercentual(fracao: string | number | null | undefined): string {
  const valor = numeroDigitado(fracao);
  if (valor == null) return "";
  return String(Math.round(valor * 10000) / 100);
}

/**
 * A volta: percentual da tela → fração do domínio (paralelo `margemPctParaFracao`). Vazio é null —
 * "sem margem própria, usa a do grupo" — e 0 continua 0, que é "vender pelo custo".
 */
export function percentualParaFracao(texto: string | number | null | undefined): number | null {
  const valor = numeroDigitado(texto);
  return valor == null ? null : valor / 100;
}

/** Margem digitada fica entre 0 e 1000% (paralelo `clampMargem`). Vazio continua vazio. */
export const MARGEM_MAXIMA_PCT = 1000;
export function limitarMargem(texto: string | number | null | undefined): string {
  const valor = numeroDigitado(texto);
  if (valor == null) return "";
  return String(Math.min(MARGEM_MAXIMA_PCT, Math.max(0, valor)));
}

/**
 * Impede que a rolagem do mouse altere um campo numérico (paralelo `semRolagemNoNumero`).
 *
 * É comportamento padrão do navegador: com o campo FOCADO, rolar a página incrementa ou decrementa
 * o número — o estoque mínimo virava 9 sem ninguém tocar nele. Tirar o foco devolve a rolagem à
 * página. Registrado UMA vez no formulário (o evento borbulha), cobre todo campo numérico, inclusive
 * os que forem criados depois.
 */
export function semRolagemNoNumero(evento: Pick<WheelEvent, "target">): void {
  const alvo = evento.target;
  if (!(alvo instanceof HTMLInputElement) || alvo.type !== "number") return;
  if (alvo.ownerDocument.activeElement === alvo) alvo.blur();
}

/** Mensagem de sucesso ao salvar. A BASE diz quantas lojas receberam a alteração. */
export function mensagemDeProdutoSalvo(entrada: { modo: "base" | "loja"; lojasAtualizadas?: number | null }): string {
  if (entrada.modo === "loja") return "Produto salvo.";
  const lojas = entrada.lojasAtualizadas;
  if (lojas == null) return "Produto salvo na base.";
  if (lojas === 0) return "Produto salvo na base. Nenhuma loja foi atualizada.";
  return `Produto salvo na base. ${lojas} ${lojas === 1 ? "loja atualizada" : "lojas atualizadas"}.`;
}
