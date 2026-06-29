import { z } from "zod";
import { paginationQuerySchema } from "../api/index.js";

export const relatorioProdutosQuerySchema = z.object({
  empresaId: z.string().uuid()
}).merge(paginationQuerySchema);

export type RelatorioProdutosQuery = z.infer<typeof relatorioProdutosQuerySchema>;
