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

export const unidadeMedidaPayloadSchema = z.object({
  empresaId: uuidSchema,
  nome: z.string().min(1),
  sigla: z.string().min(1)
});

export const unidadesMedidaQuerySchema = empresaQuerySchema;
export const importarUnidadesMedidaSchema = importarEmpresaPayloadSchema;
export const exportarUnidadeMedidaSchema = exportarEmpresaPayloadSchema;
export const unidadeMedidaParamsSchema = apiIdParamsSchema;

export type UnidadeMedidaPayload = z.infer<typeof unidadeMedidaPayloadSchema>;
export type ImportarUnidadesMedidaPayload = ImportarEmpresaPayload;
export type ExportarUnidadeMedidaPayload = ExportarEmpresaPayload;
