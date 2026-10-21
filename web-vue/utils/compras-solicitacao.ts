import type { StatusSolicitacao } from "@padaria/shared";

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
