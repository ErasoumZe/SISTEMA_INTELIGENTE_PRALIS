import { z } from "zod";

export const relatorioProdutosQuerySchema = z.object({
  empresaId: z.string().uuid()
});

export type RelatorioProdutosQuery = z.infer<typeof relatorioProdutosQuerySchema>;
