import { z } from "zod";
import type { ProdutoEstoqueDto } from "./index.js";
import {
  regraRecorrenciaSchema,
  terminoRecorrenciaSchema,
  type RegraRecorrencia,
  type TerminoRecorrencia
} from "./recorrencia.js";

// Agendamento de pedido (PROJECT_BRAIN/56, 57 e 58): o comprador marca os produtos, define a recorrencia, o
// prazo de resposta, a margem de quantidade, o responsavel e o horario de recebimento da loja. Na data, o
// responsavel e avisado e envia pela tela Solicitacao de compra (doc 58 §2).

const uuid = z.string().uuid();
const empresa = z.object({ empresaId: uuid });
const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "Data inválida");
const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/u, "Hora inválida");
const unicosPorProduto = (itens: Array<{ produtoId: string }>) =>
  new Set(itens.map((item) => item.produtoId)).size === itens.length;

/** O prazo que o fornecedor ve na cotacao, em horas (1 a 720), como o prazo da rodada. */
export const PRAZO_RESPOSTA_ATALHOS = [4, 12, 24, 48] as const;
/** Quantas datas futuras a lista mostra por agendamento. */
export const PROXIMAS_DATAS_AGENDAMENTO = 6;
/** Bolinhas: top 20% dos ultimos 3 meses (doc 56 §2.1). */
export const FATIA_TOPO_BOLINHAS = 0.2;
export const MESES_BOLINHAS = 3;

export const agendamentoProdutoSchema = z.object({
  produtoId: uuid,
  quantidadePadrao: z.number().positive().max(9_999_999).nullable().optional()
});

export const agendamentoPayloadSchema = empresa.extend({
  grupoMercadoriaId: uuid,
  responsavelId: z.string().trim().min(1).max(200).optional(),
  inicioData: dataIso,
  inicioHora: hora,
  regra: regraRecorrenciaSchema,
  termino: terminoRecorrenciaSchema,
  prazoRespostaHoras: z.number().int().min(1).max(720),
  // Doc 57 §6.3: quanto a quantidade entregue pode variar, para menos e para mais (10, 20, 30 ou 40%).
  margemVariacaoPercentual: z.union([z.literal(10), z.literal(20), z.literal(30), z.literal(40)]).default(10),
  // Doc 58 §8: a loja recebe pedido nesta janela (o fornecedor ve na cotacao). Os dois ou nenhum.
  recebimentoInicio: hora.optional().nullable(),
  recebimentoFim: hora.optional().nullable(),
  produtos: z.array(agendamentoProdutoSchema).min(1).max(500).refine(unicosPorProduto, "Produto repetido")
});

/** "Esta e as futuras" a partir de uma data (como no iPhone). Sem `aPartirDe`, vale a serie inteira. */
export const editarAgendamentoSchema = agendamentoPayloadSchema.extend({ aPartirDe: dataIso.optional() });

/** Janela de recebimento: os dois horarios ou nenhum, e o fim depois do inicio. */
export function janelaDeRecebimentoValida(inicio: string | null | undefined, fim: string | null | undefined): boolean {
  if (!inicio && !fim) return true;
  return Boolean(inicio && fim && fim > inicio);
}

export const ocorrenciaAgendamentoSchema = empresa.extend({ previstoPara: z.string().datetime({ offset: true }) });
export const moverOcorrenciaSchema = ocorrenciaAgendamentoSchema.extend({ novaData: dataIso, novaHora: hora });
export const encerrarAgendamentoSchema = empresa;
export const agendamentosQuerySchema = empresa;

export const produtosAgendamentoQuerySchema = empresa;

export type AgendamentoPayload = z.infer<typeof agendamentoPayloadSchema>;
export type EditarAgendamentoPayload = z.infer<typeof editarAgendamentoSchema>;

export type SituacaoOcorrencia = "prevista" | "agendada" | "aguardando_conferencia" | "enviada" | "cancelada";

export type AgendamentoOcorrenciaDto = {
  previstoPara: string;
  dataAtual: string;
  situacao: SituacaoOcorrencia;
};

export type AgendamentoDto = {
  id: string;
  grupoMercadoriaId: string;
  grupoNome: string;
  /** Nome do grupo pai quando o escolhido e subgrupo. */
  grupoPaiNome: string | null;
  responsavelId: string;
  responsavelNome: string;
  inicioData: string;
  inicioHora: string;
  regra: RegraRecorrencia;
  termino: TerminoRecorrencia;
  resumo: string;
  prazoRespostaHoras: number;
  margemVariacaoPercentual: number;
  recebimentoInicio: string | null;
  recebimentoFim: string | null;
  status: "ativa" | "encerrada";
  produtos: Array<{ produtoId: string; descricao: string; quantidadePadrao: string | null }>;
  proximas: AgendamentoOcorrenciaDto[];
};

/** O produto da lista de baixo: o mesmo retrato do estoque + as bolinhas (doc 56 §2.1). */
export type ProdutoAgendamentoDto = ProdutoEstoqueDto & { maisVende: boolean; maisCompra: boolean; maisLucro: boolean };

export type GrupoAgendamentoDto = { id: string; nome: string; grupoPaiId: string | null };

export type ProdutosAgendamentoDto = { produtos: ProdutoAgendamentoDto[]; grupos: GrupoAgendamentoDto[] };

/**
 * Quem esta no topo de um ranking: os primeiros ceil(20%) dos que tem medida POSITIVA. Empate na fronteira
 * entra (nao se corta produto igual ao ultimo do topo por ordem arbitraria).
 */
export function topoDoRanking(medidas: Map<string, number>, fatia = FATIA_TOPO_BOLINHAS): Set<string> {
  const positivas = [...medidas.entries()].filter(([, valor]) => valor > 0).sort((a, b) => b[1] - a[1]);
  if (!positivas.length) return new Set();
  const corte = Math.max(1, Math.ceil(positivas.length * fatia));
  const limiar = positivas[corte - 1]![1];
  return new Set(positivas.filter(([, valor]) => valor >= limiar).map(([id]) => id));
}

/** Sugestao de quantidade na data: maximo - saldo (so quando positiva). */
export function quantidadeSugerida(estoqueAtual: number | null, estoqueMax: number | null): number | null {
  if (estoqueMax === null) return null;
  const falta = estoqueMax - (estoqueAtual ?? 0);
  return falta > 0 ? Math.round(falta * 1000) / 1000 : null;
}
