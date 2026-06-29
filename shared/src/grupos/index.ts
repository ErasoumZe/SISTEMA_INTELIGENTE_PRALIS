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

export const tipoGrupoSchema = z.enum(["despesa", "mercadoria", "retirada", "vendas"]);

export const grupoPayloadSchema = z.object({
  empresaId: uuidSchema,
  tipoGrupo: tipoGrupoSchema,
  nome: z.string().min(1),
  grupoPaiId: uuidSchema.optional().nullable()
});

export const gruposQuerySchema = empresaQuerySchema;
export const importarGruposSchema = importarEmpresaPayloadSchema;
export const exportarGrupoSchema = exportarEmpresaPayloadSchema;
export const grupoParamsSchema = apiIdParamsSchema;

export type GrupoPayload = z.infer<typeof grupoPayloadSchema>;
export type TipoGrupo = z.infer<typeof tipoGrupoSchema>;
export type ImportarGruposPayload = ImportarEmpresaPayload;
export type ExportarGrupoPayload = ExportarEmpresaPayload;

