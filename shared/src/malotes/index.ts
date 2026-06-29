import { z } from "zod";
import {
  exportarEmpresaPayloadSchema,
  apiIdParamsSchema,
  importarEmpresaPayloadSchema,
  paginationQuerySchema,
  type ExportarEmpresaPayload,
  type ImportarEmpresaPayload
} from "../api/index.js";

const uuidSchema = z.string().uuid();

export const maloteParamsSchema = z.object({
  maloteId: uuidSchema
});

export const malotesQuerySchema = z.object({
  empresaId: uuidSchema.optional()
}).merge(paginationQuerySchema);

export const validarLacreQuerySchema = z.object({
  numero: z.string().min(1),
  empresaId: uuidSchema.optional()
});

export const criarMaloteSchema = z.object({
  empresaId: uuidSchema,
  codigo: z.string().min(1),
  lacres: z.array(z.string().min(1)).min(1)
});

export const atualizarMaloteSchema = z.object({
  codigo: z.string().min(1),
  lacres: z.array(z.string().min(1)).default([])
});

export const importarMalotesSchema = importarEmpresaPayloadSchema;
export const exportarMaloteSchema = exportarEmpresaPayloadSchema;
export const maloteExportacaoParamsSchema = apiIdParamsSchema;

export type MaloteParams = z.infer<typeof maloteParamsSchema>;
export type MalotesQuery = z.infer<typeof malotesQuerySchema>;
export type CriarMalotePayload = z.infer<typeof criarMaloteSchema>;
export type AtualizarMalotePayload = z.infer<typeof atualizarMaloteSchema>;
export type ImportarMalotesPayload = ImportarEmpresaPayload;
export type ExportarMalotePayload = ExportarEmpresaPayload;

