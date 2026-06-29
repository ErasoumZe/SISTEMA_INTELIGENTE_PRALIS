import { z } from "zod";

export { empresaQuerySchema as empresasQuerySchema } from "../api/index.js";

export const empresaPayloadSchema = z.object({
  nome: z.string().min(1),
  cnpj: z.string().optional().nullable()
});

export type EmpresaPayload = z.infer<typeof empresaPayloadSchema>;

