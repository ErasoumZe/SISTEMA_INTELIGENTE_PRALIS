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
    .default("TNP")
});

export type EmpresaPayload = z.infer<typeof empresaPayloadSchema>;
