import { z } from "zod";

export { empresaQuerySchema as turnosQuerySchema } from "../api/index.js";

const uuidSchema = z.string().uuid();
// Hora no formato HH:MM (aceita segundos opcionais vindos do banco: HH:MM:SS).
const horaSchema = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Hora invalida (use HH:MM)");

export const turnoPayloadSchema = z.object({
  empresaId: uuidSchema,
  nome: z.string().trim().min(1),
  horaInicio: horaSchema,
  horaFim: horaSchema,
  ativo: z.boolean().default(true)
});

export const turnoDtoSchema = z.object({
  id: z.string(),
  empresaId: z.string(),
  nome: z.string(),
  horaInicio: z.string(),
  horaFim: z.string(),
  ativo: z.boolean()
});

export type TurnoPayload = z.infer<typeof turnoPayloadSchema>;
export type TurnoDto = z.infer<typeof turnoDtoSchema>;
