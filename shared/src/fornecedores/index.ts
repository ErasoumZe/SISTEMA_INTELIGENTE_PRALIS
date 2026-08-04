import { z } from "zod";
import {
  empresaQuerySchema,
  exportarEmpresaPayloadSchema,
  apiIdParamsSchema,
  importarEmpresaPayloadSchema,
  type ExportarEmpresaPayload,
  type ImportarEmpresaPayload
} from "../api/index.js";

const uuidSchema = z.string().uuid();

export const fornecedorPayloadSchema = z.object({
  empresaId: uuidSchema,
  nome: z.string().min(1),
  documento: z.string().optional().nullable()
});

export const fornecedoresQuerySchema = empresaQuerySchema;
export const importarFornecedoresSchema = importarEmpresaPayloadSchema;
export const exportarFornecedorSchema = exportarEmpresaPayloadSchema;
export const fornecedorParamsSchema = apiIdParamsSchema;

export type FornecedorPayload = z.infer<typeof fornecedorPayloadSchema>;
export type ImportarFornecedoresPayload = ImportarEmpresaPayload;
export type ExportarFornecedorPayload = ExportarEmpresaPayload;
