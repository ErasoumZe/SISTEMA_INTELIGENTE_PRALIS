import { z } from "zod";
import { empresaQuerySchema } from "../api/index.js";

export const maquininhasQuerySchema = empresaQuerySchema;

export const maquininhaPayloadSchema = z.object({
  empresaId: z.string().uuid(),
  numeroSerie: z.string().trim().min(1),
  apelido: z.string().trim().min(1),
  ativo: z.boolean().default(true)
});

export type MaquininhaPayload = z.infer<typeof maquininhaPayloadSchema>;
