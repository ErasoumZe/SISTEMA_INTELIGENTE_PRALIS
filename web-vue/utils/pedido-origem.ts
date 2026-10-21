import type { PedidoTipo } from "@padaria/shared";

// De onde veio o pedido (R-221, E8). Depois do E8 so `rodada` nasce: o pedido e consequencia da rodada
// de cotacao (compra automatica ou excecao do comprador). `manual` e `automatico` sao pedidos criados
// antes: continuam legiveis, recebiveis (se confirmados) e cancelaveis, mas nao se editam nem se enviam.

const ROTULO_TIPO: Record<PedidoTipo, string> = {
  rodada: "Rodada de cotação",
  automatico: "Sugestão de reposição (legado)",
  manual: "Pedido manual (legado)"
};

export function rotuloDoTipoDePedido(tipo: PedidoTipo): string {
  return ROTULO_TIPO[tipo];
}

/** Pedido criado pelo caminho antigo, que o E8 aposentou. */
export function pedidoEhLegado(tipo: PedidoTipo): boolean {
  return tipo !== "rodada";
}
