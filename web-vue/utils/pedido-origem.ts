import type { PedidoStatus, PedidoTipo } from "@padaria/shared";

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

// Doc 57 §4: cotado (o fornecedor ganhou e esta separando) -> retornado (devolveu a quantidade real) ->
// confirmado (comprado) -> recebido. Um rotulo so para todas as telas.
const ROTULO_STATUS: Record<PedidoStatus, string> = {
  rascunho: "Legado: rascunho",
  aprovado: "Legado: aprovado",
  a_fazer: "A fazer",
  enviado: "Enviado",
  cotado: "Cotado",
  retornado: "Retornado",
  confirmado: "Comprado",
  recebido_parcial: "Recebido parcialmente",
  recebido: "Recebido",
  cancelado: "Cancelado"
};

export function rotuloStatusPedido(status: PedidoStatus): string {
  return ROTULO_STATUS[status];
}

export function corStatusPedido(status: PedidoStatus): string {
  if (status === "recebido") return "success";
  if (status === "recebido_parcial" || status === "confirmado") return "info";
  if (status === "cancelado") return "error";
  if (status === "retornado" || status === "cotado") return "warning";
  return "secondary";
}
