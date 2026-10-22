import type { ProdutoEstoqueDto } from "@padaria/shared";
import { gerarItensReposicao } from "@padaria/shared";
import { normalizarQuantidadeEditavel } from "~/utils/formatacao";

/** O que o estoque pede (produto no minimo, ate o maximo), no formato do formulario de solicitacao. */
export function itensDeReposicaoDoEstoque(
  produtos: ProdutoEstoqueDto[]
): Array<{ produtoId: string; quantidade: string }> {
  return gerarItensReposicao(
    produtos.map((produto) => ({
      id: produto.id,
      descricao: produto.descricao,
      quantidadeEstoque: Number(produto.quantidadeEstoque),
      estoqueMin: produto.estoqueMin === null ? null : Number(produto.estoqueMin),
      estoqueMax: produto.estoqueMax === null ? null : Number(produto.estoqueMax)
    }))
  ).map((item) => ({
    produtoId: item.produtoId,
    quantidade: normalizarQuantidadeEditavel(item.quantidadeSugerida)
  }));
}
