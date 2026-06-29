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

export const contaPayloadSchema = z.object({
  empresaId: uuidSchema,
  nome: z.string().min(1)
});

export const contasQuerySchema = empresaQuerySchema;
export const importarContasSchema = importarEmpresaPayloadSchema;
export const exportarContaSchema = exportarEmpresaPayloadSchema;
export const contaParamsSchema = apiIdParamsSchema;

export type ContaPayload = z.infer<typeof contaPayloadSchema>;
export type ImportarContasPayload = ImportarEmpresaPayload;
export type ExportarContaPayload = ExportarEmpresaPayload;

