/** Primeira numeração que não pertence mais à faixa normal de produtos. */
export const PRIMEIRO_CODIGO_FORA_DA_FAIXA = 700_000;

/** Último código de produto confirmado na fonte oficial quando o piso foi definido. */
export const ULTIMO_CODIGO_DE_PRODUTO = 13_129;

/** Próximo código interno segundo o app de Produtos usado nas lojas. */
export function calcularProximoCodigoInterno(maiorCodigoAtual: number): string {
  const maiorNaFaixa =
    Number.isFinite(maiorCodigoAtual) && maiorCodigoAtual < PRIMEIRO_CODIGO_FORA_DA_FAIXA
      ? Math.max(ULTIMO_CODIGO_DE_PRODUTO, Math.trunc(maiorCodigoAtual))
      : ULTIMO_CODIGO_DE_PRODUTO;
  const proximo = maiorNaFaixa + 1;
  if (proximo >= PRIMEIRO_CODIGO_FORA_DA_FAIXA) {
    throw new Error("Faixa de código interno de produto esgotada");
  }
  return String(proximo).padStart(5, "0");
}
