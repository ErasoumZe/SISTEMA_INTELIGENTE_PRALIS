import type { DecisaoItemDto, DecisaoPropostaDto, MotivoDecisao } from "@padaria/shared";

// Apresentacao da fila de decisao do Comprador (R-221, E6). Pura: nao conhece API nem componente.

export const ROTULO_MOTIVO: Record<MotivoDecisao, string> = {
  sem_resposta: "Sem resposta",
  indisponivel: "Fornecedor não tem",
  custo_nao_calculado: "Custo não calculado",
  sem_base: "Sem preço-base",
  acima_da_base: "Acima da base",
  teto: "Barrado pelo teto"
};

export const COR_MOTIVO: Record<MotivoDecisao, string | undefined> = {
  sem_resposta: undefined,
  indisponivel: undefined,
  custo_nao_calculado: "error",
  sem_base: "info",
  acima_da_base: "warning",
  teto: "warning"
};

// O que o Comprador entende sem abrir o doc 54: por que o item nao foi comprado sozinho.
export const AJUDA_MOTIVO: Record<MotivoDecisao, string> = {
  sem_resposta: "Nenhum fornecedor enviou preço para este item.",
  indisponivel: "Todos os fornecedores que responderam disseram que não têm o item.",
  custo_nao_calculado: "A resposta chegou, mas o custo final não foi calculado. Não dá para aprovar.",
  sem_base: "O produto não tem preço-base, então toda oferta passa pela sua decisão.",
  acima_da_base: "O custo final está acima do preço-base pré-autorizado.",
  teto: "O custo cabia na base, mas o teto de compra automática da rodada já tinha sido atingido."
};

/** Só dá para aprovar proposta com preço e custo final calculado. */
export function podeAprovarProposta(proposta: DecisaoPropostaDto): boolean {
  return !proposta.indisponivel && proposta.custoFinalUnitario !== null;
}

/** Total do item na proposta (custo final x quantidade), ou null se a proposta não tem custo. */
export function totalDaProposta(proposta: DecisaoPropostaDto, quantidade: string): number | null {
  if (proposta.custoFinalUnitario === null) return null;
  return Number((Number(proposta.custoFinalUnitario) * Number(quantidade)).toFixed(2));
}

/** Itens que sobraram, no formato do formulário de uma NOVA solicitação (não existe segunda rodada). */
export function itensParaNovaSolicitacao(itens: DecisaoItemDto[]): Array<{ produtoId: string; quantidade: string }> {
  return itens.map((item) => ({ produtoId: item.produtoId, quantidade: item.quantidade }));
}

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatarValorDecisao(valor: string | number | null): string {
  if (valor === null) return "—";
  return MOEDA.format(Number(valor));
}
