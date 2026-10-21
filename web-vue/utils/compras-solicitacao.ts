import type { ProdutoEstoqueDto, StatusSolicitacao } from "@padaria/shared";
import { gerarItensReposicao } from "@padaria/shared";
import { normalizarQuantidadeEditavel } from "~/utils/formatacao";

// Rótulos e cores da lista de solicitações de compra (R-221). Fora do componente para a aba não crescer.

export const ROTULO_STATUS: Record<StatusSolicitacao, string> = {
  rascunho: "Rascunho",
  em_cotacao: "Em cotação",
  parcialmente_comprada: "Parcialmente comprada",
  comprada: "Comprada",
  encerrada: "Encerrada",
  cancelada: "Cancelada"
};

export const COR_STATUS: Record<StatusSolicitacao, string | undefined> = {
  rascunho: undefined,
  em_cotacao: "info",
  parcialmente_comprada: "warning",
  comprada: "success",
  encerrada: undefined,
  cancelada: "error"
};

export const ROTULO_ORIGEM: Record<string, string> = { manual: "Manual", sugestao: "Sugestão", rapida: "Rápida" };

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
