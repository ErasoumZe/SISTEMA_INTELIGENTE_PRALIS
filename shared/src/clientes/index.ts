import { z } from "zod";

export { empresaQuerySchema as clientesQuerySchema } from "../api/index.js";

const uuidSchema = z.string().uuid();

export const clientePayloadSchema = z.object({
  empresaId: uuidSchema,
  nome: z.string().min(1),
  documento: z.string().optional().nullable(),
  dataNascimento: z.string().optional().nullable(),
  whatsapp: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  cep: z.string().optional().nullable(),
  rua: z.string().optional().nullable(),
  numero: z.string().optional().nullable(),
  complemento: z.string().optional().nullable(),
  bairro: z.string().optional().nullable(),
  cidade: z.string().optional().nullable(),
  estado: z.string().optional().nullable()
});

export type ClientePayload = z.infer<typeof clientePayloadSchema>;
