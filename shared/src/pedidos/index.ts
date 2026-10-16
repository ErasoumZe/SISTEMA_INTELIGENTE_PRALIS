import { z } from "zod";
import type { CotacaoResumoDto } from "../compras/cotacao.js";

const uuidSchema = z.string().uuid();

export const pedidoTipos = ["manual", "automatico"] as const;
// Os dois primeiros valores sao somente leitura para pedidos criados antes do modulo Compras.
export const pedidoStatus = [
  "rascunho",
  "aprovado",
  "a_fazer",
  "enviado",
  "retornado",
  "confirmado",
  "recebido_parcial",
  "recebido",
  "cancelado"
] as const;
export const pedidoStatusNovo = [
  "a_fazer",
  "enviado",
  "retornado",
  "confirmado",
  "recebido_parcial",
  "recebido",
  "cancelado"
] as const;
export const pedidoRecorrencias = ["nenhuma", "semanal", "quinzenal", "mensal"] as const;
export type PedidoTipo = (typeof pedidoTipos)[number];
export type PedidoStatus = (typeof pedidoStatus)[number];
export type PedidoStatusNovo = (typeof pedidoStatusNovo)[number];
export type PedidoRecorrencia = (typeof pedidoRecorrencias)[number];

export const pedidoItemPayloadSchema = z.object({
  produtoId: uuidSchema,
  quantidade: z.coerce.number().positive()
});

const agendamentoPedidoSchema = z.object({
  dataAgendada: z.string().min(10).optional().nullable(),
  recorrencia: z.enum(pedidoRecorrencias).default("nenhuma")
});

export const pedidoPayloadSchema = agendamentoPedidoSchema.extend({
  empresaId: uuidSchema,
  fornecedorId: uuidSchema,
  observacao: z.string().trim().max(1_000).optional().nullable(),
  itens: z.array(pedidoItemPayloadSchema).min(1)
});

export const pedidoEdicaoPayloadSchema = agendamentoPedidoSchema.extend({
  fornecedorId: uuidSchema.optional(),
  observacao: z.string().trim().max(1_000).optional().nullable(),
  itens: z.array(pedidoItemPayloadSchema).min(1)
});

export const gerarPedidoAutomaticoPayloadSchema = agendamentoPedidoSchema.extend({
  empresaId: uuidSchema,
  fornecedorId: uuidSchema
});

export const pedidoSituacaoPayloadSchema = z.object({
  // R-216: "Enviado" so nasce da cotacao gerada e "Retornado" so da resposta do fornecedor. A troca
  // manual fica restrita a decidir: confirmar a negociacao ou cancelar o pedido.
  status: z.enum(["confirmado", "cancelado"]),
  observacao: z.string().trim().max(1_000).optional().nullable()
});

export const pedidoRecebimentoPayloadSchema = z.object({
  idempotenciaChave: uuidSchema,
  observacao: z.string().trim().max(1_000).optional().nullable(),
  itens: z
    .array(
      z.object({
        pedidoItemId: uuidSchema,
        quantidadeConferida: z.coerce.number().positive()
      })
    )
    .min(1)
});

export const pedidosQuerySchema = z.object({
  empresaId: uuidSchema.optional(),
  status: z.enum(pedidoStatus).optional()
});

export type PedidoPayload = z.infer<typeof pedidoPayloadSchema>;
export type PedidoEdicaoPayload = z.infer<typeof pedidoEdicaoPayloadSchema>;
export type GerarPedidoAutomaticoPayload = z.infer<typeof gerarPedidoAutomaticoPayloadSchema>;
export type PedidoSituacaoPayload = z.infer<typeof pedidoSituacaoPayloadSchema>;
export type PedidoRecebimentoPayload = z.infer<typeof pedidoRecebimentoPayloadSchema>;
export type PedidosQuery = z.infer<typeof pedidosQuerySchema>;

export type PedidoItemDto = {
  id: string;
  produtoId: string | null;
  descricaoProduto: string;
  quantidade: string;
  quantidadeRecebida: string;
  quantidadePendente: string;
  estoqueAtual: string | null;
  estoqueMin: string | null;
  estoqueMax: string | null;
};

export type PedidoEventoDto = {
  id: string;
  status: PedidoStatusNovo;
  observacao: string | null;
  /** Nulo quando o ato foi do fornecedor pelo link de cotacao (R-216); o nome vem preenchido assim mesmo. */
  criadoPor: string | null;
  // Quem agiu precisa ser legivel na tela: o id sozinho nao responde "quem enviou" nem "quem recebeu".
  criadoPorNome: string;
  criadoEm: string;
};

export type PedidoDto = {
  id: string;
  empresaId: string;
  tipo: PedidoTipo;
  status: PedidoStatus;
  fornecedorId: string | null;
  fornecedorNome: string | null;
  fornecedorWhatsapp: string | null;
  dataAgendada: string | null;
  recorrencia: PedidoRecorrencia;
  observacao: string | null;
  totalItens: number;
  criadoEm: string;
  aprovadoEm: string | null;
  itens?: PedidoItemDto[];
  eventos?: PedidoEventoDto[];
  /** Cotacao mais recente do pedido (R-216), so no detalhe. */
  cotacao?: CotacaoResumoDto | null;
};

export type ProdutoEstoque = {
  id: string;
  descricao?: string | null;
  quantidadeEstoque: number;
  estoqueMin: number | null;
  estoqueMax: number | null;
};

export type ItemReposicaoSugerido = {
  produtoId: string;
  descricao: string | null;
  quantidadeAtual: number;
  estoqueMin: number;
  estoqueMax: number;
  quantidadeSugerida: number;
};

// Sugestao assistida: sem movimentos de venda/producao/perda/inventario completos nao existe
// gatilho autonomo confiavel. Esta funcao pura continua testavel e so calcula maximo - atual.
export function gerarItensReposicao(produtos: ProdutoEstoque[]): ItemReposicaoSugerido[] {
  const itens: ItemReposicaoSugerido[] = [];
  for (const produto of produtos) {
    if (produto.estoqueMin === null || produto.estoqueMax === null) continue;
    if (produto.quantidadeEstoque > produto.estoqueMin) continue;
    const quantidadeSugerida = produto.estoqueMax - produto.quantidadeEstoque;
    if (quantidadeSugerida <= 0) continue;
    itens.push({
      produtoId: produto.id,
      descricao: produto.descricao ?? null,
      quantidadeAtual: produto.quantidadeEstoque,
      estoqueMin: produto.estoqueMin,
      estoqueMax: produto.estoqueMax,
      quantidadeSugerida
    });
  }
  return itens;
}
