import { z } from "zod";

export const tiposMovimentacao = ["entrada", "despesa", "transferencia", "mercadoria", "retirada"] as const;
export type TipoMovimentacao = (typeof tiposMovimentacao)[number];

const uuidSchema = z.string().uuid();
const dinheiroSchema = z.coerce.number().min(0);

export const movimentacaoQuerySchema = z.object({
  empresaId: uuidSchema.optional(),
  tipo: z.enum(tiposMovimentacao).optional()
});

export const itemDespesaSchema = z.object({
  grupoDespesaId: uuidSchema.optional().nullable(),
  descricao: z.string().min(1),
  valor: dinheiroSchema
});

export const itemMercadoriaSchema = z.object({
  produtoId: uuidSchema.optional().nullable(),
  grupoMercadoriaId: uuidSchema.optional().nullable(),
  unidadeMedidaId: uuidSchema.optional().nullable(),
  descricao: z.string().min(1),
  quantidade: z.coerce.number().positive(),
  valorUnitario: z.coerce.number().min(0).default(0),
  valorTotal: dinheiroSchema
});

export const movimentacaoPayloadSchema = z.object({
  empresaId: uuidSchema,
  tipo: z.enum(tiposMovimentacao),
  dataReferencia: z.string().min(10),
  dataVencimento: z.string().min(10).optional().nullable(),
  dataPagamento: z.string().min(10).optional().nullable(),
  descricao: z.string().min(1),
  observacao: z.string().optional().nullable(),
  valorOriginal: dinheiroSchema,
  valorAcrescimo: dinheiroSchema.default(0),
  descricaoAcrescimo: z.string().optional().nullable(),
  valorDesconto: dinheiroSchema.default(0),
  descricaoDesconto: z.string().optional().nullable(),
  contaOrigemId: uuidSchema.optional().nullable(),
  contaDestinoId: uuidSchema.optional().nullable(),
  fornecedorId: uuidSchema.optional().nullable(),
  colaboradorId: uuidSchema.optional().nullable(),
  grupoDespesaId: uuidSchema.optional().nullable(),
  grupoMercadoriaId: uuidSchema.optional().nullable(),
  grupoRetiradaId: uuidSchema.optional().nullable(),
  maloteId: uuidSchema.optional().nullable(),
  lacreMaloteId: uuidSchema.optional().nullable(),
  notaFiscalId: z.string().optional().nullable(),
  temNotaFiscal: z.boolean().default(false),
  computar: z.boolean().default(true),
  fotoDocumentoUrl: z.string().optional().nullable(),
  itensDespesa: z.array(itemDespesaSchema).default([]),
  itensMercadoria: z.array(itemMercadoriaSchema).default([])
});

export const movimentacaoDtoSchema = z.object({
  id: z.string(),
  empresaId: z.string(),
  tipo: z.enum(tiposMovimentacao),
  dataReferencia: z.string(),
  descricao: z.string(),
  valorOriginal: z.string(),
  computar: z.boolean(),
  status: z.string()
});

export const movimentacaoCriadaSchema = z.object({
  id: z.string(),
  computar: z.boolean()
});

export type MovimentacaoQuery = z.infer<typeof movimentacaoQuerySchema>;
export type MovimentacaoPayload = z.infer<typeof movimentacaoPayloadSchema>;
export type MovimentoDto = z.infer<typeof movimentacaoDtoSchema>;
export type MovimentacaoCriada = z.infer<typeof movimentacaoCriadaSchema>;
