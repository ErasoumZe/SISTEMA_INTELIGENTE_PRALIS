// Regras de texto da Meta para variavel de modelo (WhatsApp Cloud API): sem quebra de linha, sem tabulacao,
// sem mais de 4 espacos seguidos; e o corpo inteiro do modelo tem no maximo 1.024 caracteres. Puro e testavel.

/** Limite do resumo de itens: sobra folga para o texto fixo do modelo e os outros parametros. */
export const LIMITE_RESUMO_ITENS = 600;

/** Uma variavel de modelo como a Meta aceita: uma linha so, espacos simples. */
export function parametroDeModelo(texto: string): string {
  return texto
    .replace(/[\r\n\t]+/gu, " ")
    .replace(/ {2,}/gu, " ")
    .trim();
}

/** "5 Coca 2 L; 3 Coca 1,5 L; ... e mais N item(ns)": nunca passa do limite, nunca corta um item no meio. */
export function resumoDosItens(itens: string[], limite = LIMITE_RESUMO_ITENS): string {
  const partes: string[] = [];
  for (const [indice, item] of itens.entries()) {
    const restantes = itens.length - indice - 1;
    const candidato = [...partes, item].join("; ");
    const sufixo = restantes > 0 ? `; e mais ${restantes} item(ns)` : "";
    if ((candidato + sufixo).length > limite && partes.length) {
      return `${partes.join("; ")}; e mais ${itens.length - indice} item(ns)`;
    }
    partes.push(item);
  }
  return partes.join("; ");
}
