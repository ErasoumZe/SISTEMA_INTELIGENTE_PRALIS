import { z } from "zod";
import { paginationQuerySchema } from "../api/index.js";

const uuidSchema = z.string().uuid();

export const empresaQuerySchema = z.object({
  empresaId: uuidSchema.optional()
}).merge(paginationQuerySchema);

export type EmpresaQuery = z.infer<typeof empresaQuerySchema>;
