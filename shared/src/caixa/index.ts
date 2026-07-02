import { z } from "zod";
import { paginationQuerySchema } from "../api/index.js";

const uuidSchema = z.string().uuid();
const dataHoraSchema = z.string().min(16);

export const caixaStatusQuerySchema = z.object({
  empresaId: uuidSchema
});

export const abrirCaixaPayloadSchema = z.object({
  empresaId: uuidSchema,
  pdvId: uuidSchema,
  usuarioCaixaId: z.string().min(1),
  dataHoraAbertura: dataHoraSchema,
  observacao: z.string().optional().nullable()
});

export const caixaParamsSchema = z.object({
  caixaId: uuidSchema
});

export const editarAberturaCaixaPayloadSchema = z.object({
  tokenEdicao: z.string().min(1),
  pdvId: uuidSchema,
  usuarioCaixaId: z.string().min(1),
  dataHoraAbertura: dataHoraSchema,
  observacao: z.string().optional().nullable()
});

export const acertarSaldoCaixaPayloadSchema = z.object({
  observacao: z.string().optional().nullable()
});

export const fecharCaixaPayloadSchema = z.object({
  observacao: z.string().optional().nullable()
});

export const historicoCaixaQuerySchema = z
  .object({
    empresaId: uuidSchema
  })
  .merge(paginationQuerySchema);

export const resumoCaixaSchema = z.object({
  totalEntradas: z.number(),
  totalTransferencias: z.number(),
  totalTransferenciasEntrada: z.number().optional(),
  totalTransferenciasSaida: z.number().optional(),
  totalDespesas: z.number(),
  totalRetiradas: z.number(),
  totalMercadorias: z.number().optional(),
  saldo: z.number()
});

export const caixaOperacionalSchema = z.object({
  id: uuidSchema,
  empresaId: uuidSchema,
  pdvId: uuidSchema,
  pdvNome: z.string(),
  usuarioId: z.string(),
  usuarioCaixaId: z.string(),
  usuarioCaixaNome: z.string(),
  colaboradorId: uuidSchema,
  dataHoraAbertura: z.string(),
  abertoEm: z.string(),
  dataHoraFechamento: z.string().nullable(),
  fechadoEm: z.string().nullable(),
  tokenEdicao: z.string().nullable(),
  observacao: z.string().nullable(),
  status: z.string()
});

export const caixaStatusSchema = z.object({
  caixaAberto: caixaOperacionalSchema.nullable(),
  resumo: resumoCaixaSchema.nullable()
});

export const acertoSaldoCaixaResponseSchema = z.object({
  despesaId: uuidSchema,
  debitoId: uuidSchema,
  valorDiferenca: z.number()
});

export type CaixaStatusQuery = z.infer<typeof caixaStatusQuerySchema>;
export type AbrirCaixaPayload = z.infer<typeof abrirCaixaPayloadSchema>;
export type CaixaParams = z.infer<typeof caixaParamsSchema>;
export type EditarAberturaCaixaPayload = z.infer<typeof editarAberturaCaixaPayloadSchema>;
export type AcertarSaldoCaixaPayload = z.infer<typeof acertarSaldoCaixaPayloadSchema>;
export type FecharCaixaPayload = z.infer<typeof fecharCaixaPayloadSchema>;
export type HistoricoCaixaQuery = z.infer<typeof historicoCaixaQuerySchema>;
export type ResumoCaixa = z.infer<typeof resumoCaixaSchema>;
export type CaixaOperacional = z.infer<typeof caixaOperacionalSchema>;
export type CaixaStatus = z.infer<typeof caixaStatusSchema>;
export type AcertoSaldoCaixaResponse = z.infer<typeof acertoSaldoCaixaResponseSchema>;
