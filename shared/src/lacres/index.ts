import { z } from "zod";
import { apiIdParamsSchema, empresaQuerySchema } from "../api/index.js";

const uuidSchema = z.string().uuid();

// Ponta do movimento que o lacre selou (ver lacres.origem no schema).
export const origemLacreSchema = z.enum(["saida", "retorno", "fechamento"]);
export const origensLacre = origemLacreSchema.options;
export type OrigemLacre = z.infer<typeof origemLacreSchema>;

// Listagem por empresa (escopo obrigatorio no controller) + filtros opcionais de consulta.
export const lacresQuerySchema = empresaQuerySchema.extend({
  transferenciaId: uuidSchema.optional(),
  origem: origemLacreSchema.optional()
});

// Cadastro MINIMO de um lacre: registra o numero do selo e a ponta do movimento. O vinculo com a
// transferencia e o rompimento (`rompido`) acontecem no fluxo de transferencia/abertura (ETAPA 2),
// nao neste cadastro.
export const lacrePayloadSchema = z.object({
  empresaId: uuidSchema,
  numero: z.string().min(1),
  origem: origemLacreSchema.default("saida")
});

export const lacreParamsSchema = apiIdParamsSchema;

export type LacrePayload = z.infer<typeof lacrePayloadSchema>;
export type LacresQuery = z.infer<typeof lacresQuerySchema>;
