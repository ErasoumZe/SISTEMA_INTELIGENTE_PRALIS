import { z } from "zod";

const uuidSchema = z.string().uuid();

export const resumoCaixaQuerySchema = z.object({
  empresaId: uuidSchema,
  colaboradorId: uuidSchema.optional(),
  data: z.string().min(10)
});

export const ajusteSaldoSchema = z.object({
  empresaId: uuidSchema,
  colaboradorId: uuidSchema,
  contaOrigemId: uuidSchema.optional().nullable(),
  data: z.string().min(10),
  valorDiferenca: z.coerce.number()
});

export const resumoCaixaSchema = z.object({
  totalEntradas: z.number(),
  totalTransferencias: z.number(),
  totalDespesas: z.number(),
  totalRetiradas: z.number(),
  saldo: z.number()
});

export const ajusteSaldoResponseSchema = z.object({
  movimentacaoId: z.string()
});

export type ResumoCaixaQuery = z.infer<typeof resumoCaixaQuerySchema>;
export type AjusteSaldoPayload = z.infer<typeof ajusteSaldoSchema>;
export type ResumoCaixa = z.infer<typeof resumoCaixaSchema>;
export type AjusteSaldoResponse = z.infer<typeof ajusteSaldoResponseSchema>;
