import type { PedidoRecebimentoItem } from "@padaria/shared";

export type ItemRecebimento = PedidoRecebimentoItem;

export type TentativaRecebimento = {
  pedidoId: string;
  assinatura: string;
  chave: string;
};

function assinaturaDaIntencao(itens: ItemRecebimento[], observacao: string) {
  return JSON.stringify({
    itens: [...itens].sort((a, b) => a.pedidoItemId.localeCompare(b.pedidoItemId)),
    observacao: observacao.trim()
  });
}

export function obterTentativaRecebimento(
  atual: TentativaRecebimento | null,
  pedidoId: string,
  itens: ItemRecebimento[],
  observacao: string,
  gerarChave: () => string
): TentativaRecebimento {
  const assinatura = assinaturaDaIntencao(itens, observacao);
  if (atual?.pedidoId === pedidoId && atual.assinatura === assinatura) return atual;
  return { pedidoId, assinatura, chave: gerarChave() };
}
