import type { TipoDescontoCotacao } from "@padaria/shared";

export type RespostaItemCotacao = {
  pedidoItemId: string;
  indisponivel: boolean;
  valorUnitario: string;
  descontoTipo: TipoDescontoCotacao;
  descontoValor: string;
};

export type CondicoesCotacao = {
  descontoGeralTipo: TipoDescontoCotacao;
  descontoGeralValor: string;
  prazoEntrega: string;
  condicaoPagamento: string;
  observacao: string;
};
