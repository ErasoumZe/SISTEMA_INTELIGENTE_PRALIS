import { z } from "zod";

const uuidSchema = z.string().uuid();

export const empresaQuerySchema = z.object({
  empresaId: uuidSchema.optional()
});

export type EmpresaQuery = z.infer<typeof empresaQuerySchema>;
