import { z } from "zod";
import { paginationQuerySchema } from "../api/index.js";

const uuidSchema = z.string().uuid();
const dinheiroSchema = z.coerce.number().min(0);

export const retiradasQuerySchema = z
  .object({
    empresaId: uuidSchema.optional(),
    caixaId: uuidSchema.optional()
  })
  .merge(paginationQuerySchema);

export const retiradaPayloadSchema = z.object({
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
  colaboradorId: uuidSchema,
  grupoRetiradaId: uuidSchema.optional().nullable(),
  computar: z.boolean().default(true)
});

export const retiradaDtoSchema = z.object({
  id: z.string(),
  empresaId: z.string(),
  dataReferencia: z.string(),
  descricao: z.string(),
  valorOriginal: z.string(),
  computar: z.boolean(),
  status: z.string()
});

export const retiradaCriadaSchema = z.object({
  id: z.string(),
  computar: z.boolean()
});

export type RetiradasQuery = z.input<typeof retiradasQuerySchema>;
export type RetiradaPayload = z.infer<typeof retiradaPayloadSchema>;
export type RetiradaDto = z.infer<typeof retiradaDtoSchema>;
export type RetiradaCriada = z.infer<typeof retiradaCriadaSchema>;

