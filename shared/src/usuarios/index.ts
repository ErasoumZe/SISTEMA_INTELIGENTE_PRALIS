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
  cargoId: uuidSchema,
  // Vínculo operacional opcional para contas globais; obrigatório no momento de abrir Caixa.
  pdvPadraoId: uuidSchema.optional().nullable(),
  turnoPadraoId: uuidSchema.optional().nullable()
});

export const usuarioPayloadSchema = z.object({
  empresaId: uuidSchema.optional(),
  empresaIds: z.array(uuidSchema).optional(),
  nome: z.string().min(1),
  email: z.string().email(),
  // A tela envia MASCARADO ("(11) 98888-7777") e o banco exige `^[0-9]{10,15}$`
  // (perfis_usuarios_whatsapp_check, migration 0060). Sem normalizar aqui, o contrato aceitava
  // qualquer string e quem digitasse "9999" recebia 500 "Erro interno" vindo do CHECK, em vez de 400
  // dizendo o que esta errado. A mascara e desfeita antes de validar o tamanho.
  whatsapp: z
    .string()
    .trim()
    .transform((valor) => valor.replace(/\D/g, ""))
    .refine((valor) => valor === "" || /^[0-9]{10,15}$/.test(valor), "WhatsApp deve ter de 10 a 15 digitos, com DDD")
    .transform((valor) => valor || null)
    .optional()
    .nullable(),
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
