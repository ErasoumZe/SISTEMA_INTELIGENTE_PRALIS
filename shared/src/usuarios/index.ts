import { z } from "zod";
import { rolesUsuario } from "../autenticacao/index.js";
import type { DadosExternos } from "../api/index.js";

export { empresaQuerySchema as usuariosQuerySchema } from "../api/index.js";

const uuidSchema = z.string().uuid();

export const usuarioNovoColaboradorPayloadSchema = z.object({
  empresaId: uuidSchema,
  nome: z.string().min(1),
  cpf: z.string().optional().nullable(),
  setorId: uuidSchema.optional().nullable(),
  cargoId: uuidSchema
});

export const usuarioPayloadSchema = z.object({
  empresaId: uuidSchema.optional(),
  empresaIds: z.array(uuidSchema).optional(),
  nome: z.string().min(1),
  email: z.string().email(),
  role: z.enum(rolesUsuario).optional(),
  colaboradorId: uuidSchema.optional(),
  novoColaborador: usuarioNovoColaboradorPayloadSchema.optional(),
  senha: z.string().min(6).optional().or(z.literal(""))
});

export function empresasDoUsuarioPayload(body: DadosExternos): string[] {
  const dados = body as {
    empresaId?: DadosExternos;
    empresaIds?: DadosExternos;
    novoColaborador?: { empresaId?: DadosExternos } | null;
  } | null;
  const ids = [
    ...(Array.isArray(dados?.empresaIds) ? (dados.empresaIds as DadosExternos[]) : []),
    ...(dados?.empresaId ? [dados.empresaId] : []),
    ...(dados?.novoColaborador?.empresaId ? [dados.novoColaborador.empresaId] : [])
  ];
  return [
    ...new Set(ids.filter((id): id is string => typeof id === "string" && id.trim().length > 0).map((id) => id.trim()))
  ];
}

export type UsuarioPayload = z.infer<typeof usuarioPayloadSchema>;
export type UsuarioNovoColaboradorPayload = z.infer<typeof usuarioNovoColaboradorPayloadSchema>;
