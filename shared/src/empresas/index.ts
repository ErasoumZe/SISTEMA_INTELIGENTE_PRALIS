import { z } from "zod";

export { empresaQuerySchema as empresasQuerySchema } from "../api/index.js";

export const empresaPayloadSchema = z.object({
  nome: z.string().min(1),
  cnpj: z.string().optional().nullable(),
  // Cada empresa numera as próprias matrículas. O padrão histórico da TNP preserva as empresas
  // atuais; uma nova unidade escolhe seu prefixo no próprio cadastro.
  matriculaPrefixo: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,8}$/)
    .default("TNP")
});

export type EmpresaPayload = z.infer<typeof empresaPayloadSchema>;
