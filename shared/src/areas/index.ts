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

export const areaPayloadSchema = z.object({
  empresaId: uuidSchema,
  nome: z.string().min(1)
});

export const areasQuerySchema = empresaQuerySchema;
export const importarAreasSetoresSchema = importarEmpresaPayloadSchema;
export const exportarAreaSetorSchema = exportarEmpresaPayloadSchema;
export const areaSetorParamsSchema = apiIdParamsSchema;

export type AreaPayload = z.infer<typeof areaPayloadSchema>;
export type ImportarAreasSetoresPayload = ImportarEmpresaPayload;
export type ExportarAreaSetorPayload = ExportarEmpresaPayload;
