import { z } from "zod";
import { paginationQuerySchema } from "../api/index.js";

const uuidSchema = z.string().uuid();
const dinheiroSchema = z.coerce.number().min(0);

export const mercadoriasQuerySchema = z
  .object({
    empresaId: uuidSchema.optional(),
    caixaId: uuidSchema.optional()
  })
  .merge(paginationQuerySchema);

export const mercadoriaItemSchema = z.object({
  produtoId: uuidSchema.optional().nullable(),
  grupoMercadoriaId: uuidSchema.optional().nullable(),
  unidadeMedidaId: uuidSchema.optional().nullable(),
  descricao: z.string().min(1),
  quantidade: z.coerce.number().positive(),
  valorUnitario: z.coerce.number().min(0).default(0),
  valorTotal: dinheiroSchema
});

export const mercadoriaPayloadSchema = z.object({
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
  fornecedorId: uuidSchema,
  grupoMercadoriaId: uuidSchema.optional().nullable(),
  notaFiscalId: z.string().optional().nullable(),
  temNotaFiscal: z.boolean().default(false),
  computar: z.boolean().default(true),
  fotoDocumentoUrl: z.string().optional().nullable(),
  itensMercadoria: z.array(mercadoriaItemSchema).default([])
});

export const mercadoriaDtoSchema = z.object({
  id: z.string(),
  empresaId: z.string(),
  dataReferencia: z.string(),
  descricao: z.string(),
  valorOriginal: z.string(),
  computar: z.boolean(),
  status: z.string()
});

export const mercadoriaCriadaSchema = z.object({
  id: z.string(),
  computar: z.boolean()
});

export type MercadoriasQuery = z.input<typeof mercadoriasQuerySchema>;
export type MercadoriaPayload = z.infer<typeof mercadoriaPayloadSchema>;

// Detalhe para edicao: payload completo (com filhos) + identificacao do registro.
export type MercadoriaDetalheDto = MercadoriaPayload & { id: string; status: string; caixaId: string | null };
export type MercadoriaDto = z.infer<typeof mercadoriaDtoSchema>;
export type MercadoriaCriada = z.infer<typeof mercadoriaCriadaSchema>;
