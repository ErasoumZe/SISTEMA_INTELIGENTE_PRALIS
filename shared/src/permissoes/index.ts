import { z } from "zod";
import { paginationQuerySchema } from "../api/index.js";
import { permissoes } from "../autenticacao/index.js";

export { empresaQuerySchema as permissoesQuerySchema } from "../api/index.js";

const uuidSchema = z.string().uuid();

export const tipoPermissaoSchema = z.enum(["cargo", "setor", "usuario"]);
export const regrasPermissoesSchema = z.partialRecord(z.enum(permissoes), z.boolean()).default({});

export const permissaoPayloadSchema = z.object({
  tipoPermissao: tipoPermissaoSchema.default("cargo"),
  cargoId: uuidSchema.optional(),
  setorId: uuidSchema.optional().nullable(),
  usuarioId: z.string().min(1).optional(),
  regras: regrasPermissoesSchema
});

export const permissoesPaginadasQuerySchema = z
  .object({
    empresaId: uuidSchema.optional(),
    q: z.string().trim().optional().default(""),
    tipoPermissao: tipoPermissaoSchema.optional(),
    alvoId: z.string().trim().optional().default(""),
    permissao: z.enum(permissoes).optional()
  })
  .merge(paginationQuerySchema);

export const excluirPermissaoQuerySchema = z.object({
  empresaId: uuidSchema.optional(),
  tipoPermissao: tipoPermissaoSchema,
  alvoId: z.string().min(1),
  permissao: z.enum(permissoes)
});

export type TipoPermissao = z.infer<typeof tipoPermissaoSchema>;
export type PermissaoPayload = z.infer<typeof permissaoPayloadSchema>;
export type PermissoesPaginadasQuery = z.infer<typeof permissoesPaginadasQuerySchema>;
export type ExcluirPermissaoQuery = z.infer<typeof excluirPermissaoQuerySchema>;
