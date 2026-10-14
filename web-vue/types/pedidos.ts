import type { PedidoRecorrencia } from "@padaria/shared";

/** Estado editável do formulário de criação e ajuste de pedido. */
export type PedidoFormEdicao = {
  fornecedorId: string;
  recorrencia: PedidoRecorrencia;
  dataAgendada: string;
  observacao: string;
  itens: Array<{ produtoId: string; quantidade: string }>;
};
