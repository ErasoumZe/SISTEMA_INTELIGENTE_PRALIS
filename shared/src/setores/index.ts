import { z } from "zod";

export { empresaQuerySchema as setoresQuerySchema } from "../api/index.js";

const uuidSchema = z.string().uuid();

export const setorPayloadSchema = z.object({
  empresaId: uuidSchema,
  nome: z.string().min(1),
  areaId: uuidSchema.optional().nullable(),
  setorPaiId: uuidSchema.optional().nullable()
});

export type SetorPayload = z.infer<typeof setorPayloadSchema>;

