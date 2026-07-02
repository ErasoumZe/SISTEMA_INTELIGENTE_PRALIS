import { z } from "zod";
import { paginationQuerySchema } from "../api/index.js";

const uuidSchema = z.string().uuid();
const dinheiroSchema = z.coerce.number().min(0);

export const transferenciasQuerySchema = z
  .object({
    empresaId: uuidSchema.optional(),
    caixaId: uuidSchema.optional()
  })
  .merge(paginationQuerySchema);

export const transferenciaPayloadSchema = z.object({
  empresaId: uuidSchema,
  dataReferencia: z.string().min(10),
  descricao: z.string().min(1),
  observacao: z.string().optional().nullable(),
  valorOriginal: dinheiroSchema,
  valorAcrescimo: dinheiroSchema.default(0),
  descricaoAcrescimo: z.string().optional().nullable(),
  valorDesconto: dinheiroSchema.default(0),
  descricaoDesconto: z.string().optional().nullable(),
  contaOrigemId: uuidSchema,
  contaDestinoId: uuidSchema,
  maloteId: uuidSchema.optional().nullable(),
  lacreMaloteId: uuidSchema.optional().nullable(),
  computar: z.boolean().default(true)
});

export const transferenciaDtoSchema = z.object({
  id: z.string(),
  empresaId: z.string(),
  dataReferencia: z.string(),
  descricao: z.string(),
  valorOriginal: z.string(),
  computar: z.boolean(),
  status: z.string()
});

export const transferenciaCriadaSchema = z.object({
  id: z.string(),
  computar: z.boolean()
});

export type TransferenciasQuery = z.input<typeof transferenciasQuerySchema>;
export type TransferenciaPayload = z.infer<typeof transferenciaPayloadSchema>;

// Detalhe para edicao: payload completo (com filhos) + identificacao do registro.
export type TransferenciaDetalheDto = TransferenciaPayload & { id: string; status: string; caixaId: string | null };
export type TransferenciaDto = z.infer<typeof transferenciaDtoSchema>;
export type TransferenciaCriada = z.infer<typeof transferenciaCriadaSchema>;
