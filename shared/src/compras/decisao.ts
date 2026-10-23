import { z } from "zod";
import type { StatusRodada } from "./rodada.js";
import type { StatusSolicitacao } from "./solicitacao.js";

const uuid = z.string().uuid();

// Fechamento da rodada e fila de decisao do Comprador (R-221 decisoes 1 e 6, PROJECT_BRAIN/54).
// A fila nao e tabela: e o que sobra do envelope congelado sem adjudicacao.

export const decisoesQuerySchema = z.object({ empresaId: uuid });

// O Comprador escolhe QUAL proposta aprova (varios fornecedores podem ter preco para o mesmo item).
// Doc 58 §4: "Com aumento" — aceitar o preco so desta vez, ou aceitar e reajustar a referencia da proxima rodada.
export const aprovarExcecaoPayloadSchema = z.object({
  empresaId: uuid,
  propostaItemId: uuid,
  reajustarReferencia: z.boolean().default(false)
});

export const encerrarSolicitacaoPayloadSchema = z.object({ empresaId: uuid });

// "Encerrar rodada agora": o Comprador fecha antes do prazo (motivo `comprador`).
export const encerrarRodadaPayloadSchema = z.object({ empresaId: uuid });

export type DecisoesQuery = z.infer<typeof decisoesQuerySchema>;
export type AprovarExcecaoPayload = z.infer<typeof aprovarExcecaoPayloadSchema>;
export type EncerrarSolicitacaoPayload = z.infer<typeof encerrarSolicitacaoPayloadSchema>;
export type EncerrarRodadaPayload = z.infer<typeof encerrarRodadaPayloadSchema>;

export const motivosDecisao = [
  "sem_resposta",
  "indisponivel",
  "custo_nao_calculado",
  "sem_base",
  "acima_da_base",
  "teto"
] as const;
export type MotivoDecisao = (typeof motivosDecisao)[number];

/** Retrato minimo da ULTIMA proposta de um fornecedor para um item (so o que decide o motivo). */
export type PropostaParaMotivo = {
  indisponivel: boolean;
  // Custo gravado pela compra automatica; null = a proposta tem preco mas o custo nao foi calculado.
  custoFinalUnitario: number | null;
};

/**
 * Por que um item do envelope ficou sem vencedor. PURA: o servidor chama so para itens sem
 * adjudicacao. Quem le o motivo decide a acao; ele nao revela nada ao fornecedor (so o Comprador ve).
 */
export function motivoDecisao(propostas: PropostaParaMotivo[], precoBase: number | null): MotivoDecisao {
  if (!propostas.length) return "sem_resposta";
  const ofertas = propostas.filter((proposta) => !proposta.indisponivel);
  if (!ofertas.length) return "indisponivel";
  const custos = ofertas.map((oferta) => oferta.custoFinalUnitario).filter((custo): custo is number => custo !== null);
  // Preco sem custo gravado: a compra automatica falhou depois de gravar a resposta. Nao da para
  // aprovar sem inventar o rateio do frete (decisao 5), entao o motivo e proprio.
  if (!custos.length) return "custo_nao_calculado";
  if (precoBase === null) return "sem_base";
  return Math.min(...custos) > precoBase ? "acima_da_base" : "teto";
}

/**
 * Status da solicitacao quando a rodada fecha (decisao 6). `parcialmente_comprada` cobre tambem o
 * "nada comprado": o contrato nao tem outro estado, e o item sem vencedor continua na fila.
 */
export function statusSolicitacaoAposFechamento(
  totalItens: number,
  itensAdjudicados: number
): Extract<StatusSolicitacao, "comprada" | "parcialmente_comprada"> {
  return totalItens > 0 && itensAdjudicados >= totalItens ? "comprada" : "parcialmente_comprada";
}

export type DecisaoPropostaDto = {
  propostaItemId: string;
  conviteId: string;
  // Contraproposta que o comprador ja mandou para este item e que o fornecedor ainda nao respondeu.
  contrapropostaUnitario: string | null;
  fornecedorId: string;
  fornecedorNome: string;
  versao: number;
  indisponivel: boolean;
  valorUnitario: string | null;
  freteRateado: string | null;
  custoFinalUnitario: string | null;
};

export type DecisaoItemDto = {
  rodadaItemId: string;
  solicitacaoItemId: string;
  produtoId: string;
  descricaoProduto: string;
  quantidade: string;
  precoBaseValor: string | null;
  motivo: MotivoDecisao;
  propostas: DecisaoPropostaDto[];
};

export type DecisoesRodadaDto = {
  rodadaId: string;
  solicitacaoId: string;
  status: StatusRodada;
  totalItens: number;
  itensComprados: number;
  itens: DecisaoItemDto[];
};
