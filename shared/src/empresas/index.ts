import { z } from "zod";

export { empresaQuerySchema as empresasQuerySchema } from "../api/index.js";

export const empresaPayloadSchema = z.object({
  nome: z.string().min(1),
  cnpj: z.string().optional().nullable(),
  matriculaPrefixo: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,8}$/)
    .default("TNP"),
  fusoHorario: z.string().trim().min(1).default("America/Sao_Paulo"),
  comprasPrazoRespostaHoras: z.coerce.number().int().positive().optional().nullable()
});

export type EmpresaPayload = z.infer<typeof empresaPayloadSchema>;
