import { z } from "zod";

export { empresaQuerySchema as pdvsQuerySchema } from "../api/index.js";

const uuidSchema = z.string().uuid();

export const pdvPayloadSchema = z.object({
  empresaId: uuidSchema,
  nome: z.string().min(1),
  contaId: uuidSchema,
  ativo: z.boolean().optional().default(true)
});

export type PdvPayload = z.infer<typeof pdvPayloadSchema>;

