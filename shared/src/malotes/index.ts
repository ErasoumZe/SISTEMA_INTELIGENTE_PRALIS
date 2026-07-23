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
const dinheiroSchema = z.coerce.number().min(0);

// Ciclo do malote fisico: disponivel -> em_uso (selecionado numa abertura de caixa) -> devolvido (M2).
export const maloteStatusSchema = z.enum(["disponivel", "em_uso", "devolvido"]);

export const maloteParamsSchema = z.object({
  maloteId: uuidSchema
});

export const malotesQuerySchema = z
  .object({
    empresaId: uuidSchema.optional()
  })
  .merge(paginationQuerySchema);

export const validarLacreQuerySchema = z.object({
  numero: z.string().min(1),
  empresaId: uuidSchema.optional()
});

// O identificador que o operador controla e o LACRE (numero unico, fonte externa). O "codigo do malote"
// (o saco) e opcional: quando vazio, o servidor gera um sequencial por empresa. Por isso codigo e opcional.
// valor = fundo emprestado do cofre (R8); vira a divida do caixa quando o malote e usado na abertura.
export const criarMaloteSchema = z.object({
  empresaId: uuidSchema,
  codigo: z.string().trim().optional(),
  valor: dinheiroSchema.default(0),
  lacres: z.array(z.string().min(1)).min(1)
});

export const atualizarMaloteSchema = z.object({
  codigo: z.string().trim().optional(),
  valor: dinheiroSchema.default(0),
  lacres: z.array(z.string().min(1)).default([])
});

export const importarMalotesSchema = importarEmpresaPayloadSchema;
export const exportarMaloteSchema = exportarEmpresaPayloadSchema;
export const maloteExportacaoParamsSchema = apiIdParamsSchema;

export type MaloteStatus = z.infer<typeof maloteStatusSchema>;
export type MaloteParams = z.infer<typeof maloteParamsSchema>;
export type MalotesQuery = z.infer<typeof malotesQuerySchema>;
export type CriarMalotePayload = z.infer<typeof criarMaloteSchema>;
export type AtualizarMalotePayload = z.infer<typeof atualizarMaloteSchema>;
export type ImportarMalotesPayload = ImportarEmpresaPayload;
export type ExportarMalotePayload = ExportarEmpresaPayload;
