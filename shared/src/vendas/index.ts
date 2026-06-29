import { z } from "zod";
import { paginationQuerySchema } from "../api/index.js";

const uuidSchema = z.string().uuid();
const dinheiroSchema = z.coerce.number().min(0);

export const vendasQuerySchema = z
  .object({
    empresaId: uuidSchema.optional()
  })
  .merge(paginationQuerySchema);

export const vendaItemSchema = z.object({
  produtoId: uuidSchema.optional().nullable(),
  produtoAutomacaoId: z.string().optional().nullable(),
  produtoAutomacaoCodigo: z.string().optional().nullable(),
  descricaoProduto: z.string().min(1),
  quantidade: z.coerce.number().min(0).default(0),
  valorUnitario: z.coerce.number().min(0).default(0),
  valorTotal: dinheiroSchema
});

export const vendaPagamentoSchema = z.object({
  formaPagamentoId: uuidSchema.optional().nullable(),
  tipoPagamentoAutomacaoId: z.string().optional().nullable(),
  tipoPagamentoAutomacao: z.string().optional().nullable(),
  numeroVendas: z.coerce.number().int().min(0).default(0),
  totalPago: dinheiroSchema
});

export const vendaPayloadSchema = z.object({
  empresaId: uuidSchema,
  dataReferencia: z.string().min(10),
  dataPagamento: z.string().min(10).optional().nullable(),
  descricao: z.string().min(1),
  observacao: z.string().optional().nullable(),
  valorOriginal: dinheiroSchema,
  valorAcrescimo: dinheiroSchema.default(0),
  descricaoAcrescimo: z.string().optional().nullable(),
  valorDesconto: dinheiroSchema.default(0),
  descricaoDesconto: z.string().optional().nullable(),
  contaOrigemId: uuidSchema.optional().nullable(),
  pdvId: uuidSchema.optional().nullable(),
  colaboradorId: uuidSchema.optional().nullable(),
  computar: z.boolean().default(true),
  itensVenda: z.array(vendaItemSchema).default([]),
  tiposPagamento: z.array(vendaPagamentoSchema).default([])
});

export const vendaDtoSchema = z.object({
  id: z.string(),
  empresaId: z.string(),
  dataReferencia: z.string(),
  descricao: z.string(),
  valorOriginal: z.string(),
  computar: z.boolean(),
  status: z.string()
});

export const vendaCriadaSchema = z.object({
  id: z.string(),
  computar: z.boolean()
});

export type VendasQuery = z.input<typeof vendasQuerySchema>;
export type VendaPayload = z.infer<typeof vendaPayloadSchema>;
export type VendaDto = z.infer<typeof vendaDtoSchema>;
export type VendaCriada = z.infer<typeof vendaCriadaSchema>;
