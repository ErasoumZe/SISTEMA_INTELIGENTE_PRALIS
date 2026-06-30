import { z } from "zod";
import { paginationQuerySchema } from "../api/index.js";

export const relatorioProdutosQuerySchema = z.object({
  empresaId: z.string().uuid(),
  caixaId: z.string().uuid().optional()
}).merge(paginationQuerySchema);

export type RelatorioProdutosQuery = z.infer<typeof relatorioProdutosQuerySchema>;

