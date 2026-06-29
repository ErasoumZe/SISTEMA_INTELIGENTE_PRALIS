import { z } from "zod";
import { paginationQuerySchema } from "../api/index.js";

const uuidSchema = z.string().uuid();
const dinheiroSchema = z.coerce.number().min(0);

export const despesasQuerySchema = z
  .object({
    empresaId: uuidSchema.optional(),
    dataInicio: z.string().min(10).optional(),
    dataFim: z.string().min(10).optional(),
    pdvId: uuidSchema.optional(),
    somentePendentes: z.coerce.boolean().optional().default(false)
  })
  .merge(paginationQuerySchema);

export const despesaItemSchema = z.object({
  grupoDespesaId: uuidSchema.optional().nullable(),
  colaboradorId: uuidSchema.optional().nullable(),
  descricao: z.string().min(1),
  valor: dinheiroSchema
});

export const despesaPayloadSchema = z.object({
  empresaId: uuidSchema,
  dataReferencia: z.string().min(10),
  dataVencimento: z.string().min(10),
  dataPagamento: z.string().min(10).optional().nullable(),
  descricao: z.string().min(1),
  observacao: z.string().optional().nullable(),
  valorOriginal: dinheiroSchema,
  valorAcrescimo: dinheiroSchema.default(0),
  descricaoAcrescimo: z.string().optional().nullable(),
  valorDesconto: dinheiroSchema.default(0),
  descricaoDesconto: z.string().optional().nullable(),
  contaOrigemId: uuidSchema.optional().nullable(),
  fornecedorId: uuidSchema.optional().nullable(),
  colaboradorId: uuidSchema.optional().nullable(),
  grupoDespesaId: uuidSchema.optional().nullable(),
  computar: z.boolean().default(true),
  fotoDocumentoUrl: z.string().optional().nullable(),
  itensDespesa: z.array(despesaItemSchema).default([])
});

export const despesaDtoSchema = z.object({
  id: z.string(),
  empresaId: z.string(),
  dataReferencia: z.string(),
  dataVencimento: z.string().optional(),
  dataPagamento: z.string().nullable().optional(),
  descricao: z.string(),
  valorOriginal: z.string(),
  computar: z.boolean(),
  status: z.string()
});

export const despesaCriadaSchema = z.object({
  id: z.string(),
  computar: z.boolean()
});

export type DespesasQuery = z.input<typeof despesasQuerySchema>;
export type DespesaPayload = z.infer<typeof despesaPayloadSchema>;
export type DespesaDto = z.infer<typeof despesaDtoSchema>;
export type DespesaCriada = z.infer<typeof despesaCriadaSchema>;
