import { z } from "zod";

export { empresaQuerySchema as formasPagamentoQuerySchema } from "../api/index.js";

const uuidSchema = z.string().uuid();

export const formaPagamentoPayloadSchema = z.object({
  empresaId: uuidSchema,
  nome: z.string().min(1)
});

export type FormaPagamentoPayload = z.infer<typeof formaPagamentoPayloadSchema>;
