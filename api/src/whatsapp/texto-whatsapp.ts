// Texto da mensagem do WhatsApp. Puro e testavel.

/** Limite do resumo de itens do "pode entregar": a mensagem continua curta de ler no celular. */
export const LIMITE_RESUMO_ITENS = 600;

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
