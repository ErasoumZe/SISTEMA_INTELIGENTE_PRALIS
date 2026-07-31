import { z } from "zod";
import { empresaQuerySchema } from "../api/index.js";

export const sociosGestoresQuerySchema = empresaQuerySchema;

export const socioGestorPayloadSchema = z.object({
  empresaId: z.string().uuid(),
  nome: z.string().trim().min(1),
  ativo: z.boolean().default(true)
});

export type SocioGestorPayload = z.infer<typeof socioGestorPayloadSchema>;
