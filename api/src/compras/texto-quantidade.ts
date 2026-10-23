/** Quantidade como a pessoa le no historico: 5,2 (ate 3 casas, sem zeros a direita). */
export function formatarQuantidade(valor: string | number): string {
  return Number(valor).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}
