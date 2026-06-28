import { z } from "zod";

const uuidSchema = z.string().uuid();

export const maloteParamsSchema = z.object({
  maloteId: uuidSchema
});

export const malotesQuerySchema = z.object({
  empresaId: uuidSchema.optional()
});

export const validarLacreQuerySchema = z.object({
  numero: z.string().min(1),
  empresaId: uuidSchema.optional()
});

export const criarMaloteSchema = z.object({
  empresaId: uuidSchema,
  codigo: z.string().min(1),
  lacres: z.array(z.string().min(1)).min(1)
});

export const atualizarMaloteSchema = z.object({
  codigo: z.string().min(1),
  lacres: z.array(z.string().min(1)).default([])
});

export type MaloteParams = z.infer<typeof maloteParamsSchema>;
export type MalotesQuery = z.infer<typeof malotesQuerySchema>;
export type CriarMalotePayload = z.infer<typeof criarMaloteSchema>;
export type AtualizarMalotePayload = z.infer<typeof atualizarMaloteSchema>;
