import { z } from "zod";
import { apiIdParamsSchema, empresaQuerySchema } from "../api/index.js";

const uuidSchema = z.string().uuid();

// Listagem dos vinculos usuario<->conta por empresa (escopo obrigatorio no controller). Filtros
// opcionais para montar "contas do usuario X" ou "usuarios da conta Y".
export const contasUsuariosQuerySchema = empresaQuerySchema.extend({
  contaId: uuidSchema.optional(),
  usuarioId: z.string().min(1).optional()
});

// Criacao de UM vinculo usuario<->conta. A unicidade (conta+usuario) e garantida pelo banco.
export const contaUsuarioPayloadSchema = z.object({
  empresaId: uuidSchema,
  contaId: uuidSchema,
  usuarioId: z.string().min(1)
});

export const contaUsuarioParamsSchema = apiIdParamsSchema;

export type ContaUsuarioPayload = z.infer<typeof contaUsuarioPayloadSchema>;
export type ContasUsuariosQuery = z.infer<typeof contasUsuariosQuerySchema>;
