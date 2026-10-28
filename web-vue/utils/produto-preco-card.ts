import { calcularPrecoVenda, normalizarGrupoFiscal, type ProdutoResumo, type RegraFiscalGrupo } from "@padaria/shared";

/**
 * Preco do card = o MESMO numero que o formulario mostra em "V. Venda (calculado)": `calcularPrecoVenda`
 * do shared, com a margem do grupo da planilha quando o produto nao tem margem propria (paralelo
 * BUG-01). Nenhuma formula nova aqui — so a montagem da entrada a partir do resumo da listagem.
 */

/** Margem padrao (fracao) por grupo, casada pelo NOME normalizado (os nomes da planilha tem invisiveis). */
export function margensPorGrupo(regras: readonly RegraFiscalGrupo[]): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const regra of regras) {
    if (regra.margemPadrao != null) mapa.set(normalizarGrupoFiscal(regra.grupo), regra.margemPadrao);
  }
  return mapa;
}

const numeroOuNulo = (valor: string | number | null | undefined) => {
  if (valor == null || String(valor).trim() === "") return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
};

/** `null` quando nao ha preco a mostrar (zero, como no paralelo, conta como "sem preco"). */
export function precoCalculadoDoProduto(
  produto: Pick<ProdutoResumo, "auto" | "custo" | "quantidadeCaixa" | "margem" | "precoVenda" | "grupoNome">,
  margens: ReadonlyMap<string, number>
): number | null {
  const preco = calcularPrecoVenda({
    auto: produto.auto,
    custo: numeroOuNulo(produto.custo) ?? 0,
    quantidadeCaixa: produto.quantidadeCaixa || 1,
    margem: numeroOuNulo(produto.margem),
    margemGrupo: produto.grupoNome ? (margens.get(normalizarGrupoFiscal(produto.grupoNome)) ?? 0) : 0,
    precoManual: numeroOuNulo(produto.precoVenda) ?? 0
  });
  return preco > 0 ? preco : null;
}

export const reais = (valor: number) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
