import { z } from "zod";
import type { ProdutoEstoqueDto } from "./index.js";
import {
  regraRecorrenciaSchema,
  terminoRecorrenciaSchema,
  type RegraRecorrencia,
  type TerminoRecorrencia
} from "./recorrencia.js";

// Agendamento de pedido (PROJECT_BRAIN/56): o comprador marca os produtos, define a recorrencia e o prazo
// de resposta. Na data, nasce a solicitacao para ele conferir e enviar; o sistema nao envia sozinho.

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
  produtos: z.array(agendamentoProdutoSchema).min(1).max(500).refine(unicosPorProduto, "Produto repetido")
});

/** "Esta e as futuras" a partir de uma data (como no iPhone). Sem `aPartirDe`, vale a serie inteira. */
export const editarAgendamentoSchema = agendamentoPayloadSchema.extend({ aPartirDe: dataIso.optional() });

export const ocorrenciaAgendamentoSchema = empresa.extend({ previstoPara: z.string().datetime({ offset: true }) });
export const moverOcorrenciaSchema = ocorrenciaAgendamentoSchema.extend({ novaData: dataIso, novaHora: hora });
export const encerrarAgendamentoSchema = empresa;
export const agendamentosQuerySchema = empresa;

export const produtosAgendamentoQuerySchema = empresa;

/** Envio da conferencia: quantidades finais, produtos acrescentados e, por fornecedor, os itens dele. */
export const enviarOcorrenciaSchema = empresa.extend({
  itens: z
    .array(z.object({ produtoId: uuid, quantidade: z.number().positive().max(9_999_999) }))
    .min(1)
    .max(500)
    .refine(unicosPorProduto, "Produto repetido"),
  convites: z
    .array(z.object({ fornecedorId: uuid, produtoIds: z.array(uuid).min(1) }))
    .min(1)
    .max(100)
    .refine(
      (convites) => new Set(convites.map((convite) => convite.fornecedorId)).size === convites.length,
      "Fornecedor repetido"
    )
});

export type AgendamentoPayload = z.infer<typeof agendamentoPayloadSchema>;
export type EditarAgendamentoPayload = z.infer<typeof editarAgendamentoSchema>;
export type EnviarOcorrenciaPayload = z.infer<typeof enviarOcorrenciaSchema>;

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
  status: "ativa" | "encerrada";
  produtos: Array<{ produtoId: string; descricao: string; quantidadePadrao: string | null }>;
  proximas: AgendamentoOcorrenciaDto[];
};

export type OcorrenciaParaConferirDto = {
  id: string;
  agendaId: string;
  resumo: string;
  grupoNome: string;
  dataAtual: string;
  solicitacaoId: string;
  prazoRespostaHoras: number;
  totalItens: number;
};

export type FornecedorSugeridoDto = {
  fornecedorId: string;
  nome: string;
  whatsapp: string | null;
  situacao: "ativo" | "inativo";
  precoOfertado: string | null;
};

export type EnvioOcorrenciaDto = {
  ocorrenciaId: string;
  solicitacaoId: string;
  prazoRespostaHoras: number;
  itens: Array<{
    produtoId: string;
    descricao: string;
    quantidade: string;
    estoqueAtual: string | null;
    estoqueMax: string | null;
    fornecedores: FornecedorSugeridoDto[];
  }>;
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
