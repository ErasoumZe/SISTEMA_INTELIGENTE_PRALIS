// Sufixos de unidade que a integracao do PDV e o paralelo poem no fim do nome ("… UN", "… KG KG", "… 1 UN").
const SUFIXO_DE_UNIDADE = new Set(["UN", "UND", "KG", "CX", "PCT", "FD", "LT", "G", "ML", "1"]);

/**
 * Nome para decidir se o produto antigo do PDV e o MESMO da linha do backup (fase B2, juntar): sem acento, sem
 * pontuacao e sem os sufixos de unidade. O mesmo codigo do PDV ja apareceu em produtos diferentes (outro sabor,
 * a caixa com 6): esses nao entram na juncao (30/10/2026).
 */
export function nomeParaJuntar(nome: string): string {
  const palavras = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  while (palavras.length > 1 && SUFIXO_DE_UNIDADE.has(palavras.at(-1)!)) palavras.pop();
  return palavras.join(" ");
}
