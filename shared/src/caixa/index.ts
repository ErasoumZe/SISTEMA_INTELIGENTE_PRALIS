import { z } from "zod";
import { paginationQuerySchema } from "../api/index.js";
import { deCentavos } from "../dinheiro/index.js";
import { saldoCaixaCentavos, type TotaisCaixaCentavos } from "./regras.js";

export * from "./regras.js";

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

// --- Alteracao de horario por token / permissao direta -----------------------------------------
export const autorizacoesCaixaQuerySchema = z.object({ empresaId: uuidSchema });
export const autorizacaoCaixaParamsSchema = z.object({ autorizacaoId: uuidSchema });

// Operador (sem a permissao) solicita a alteracao escolhendo um autorizador com caixa_alterar_horario.
export const solicitarAutorizacaoCaixaPayloadSchema = z.object({
  autorizadorId: z.string().min(1),
  observacao: z.string().trim().max(500).optional().nullable()
});

// Alteracao do horario de abertura: token exigido para quem NAO tem a permissao; observacao SEMPRE
// obrigatoria (motivo), nos dois fluxos (token e permissao direta).
export const alterarHorarioCaixaPayloadSchema = z.object({
  dataHoraAbertura: dataHoraSchema,
  token: z.string().trim().optional(),
  observacao: z.string().trim().min(1, "Observacao obrigatoria").max(500)
});

export const autorizadorCaixaSchema = z.object({
  usuarioId: z.string(),
  nome: z.string()
});

export const solicitacaoAutorizacaoCaixaSchema = z.object({
  id: uuidSchema,
  caixaId: uuidSchema,
  solicitanteId: z.string(),
  solicitanteNome: z.string(),
  observacao: z.string().nullable(),
  tokenGerado: z.boolean(),
  expiraEm: z.string().nullable(),
  criadoEm: z.string()
});

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

export const alterarHorarioCaixaResponseSchema = caixaStatusSchema.extend({
  revinculacao: z.object({ anexadas: z.number(), desanexadas: z.number() })
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

// Converte os totais em centavos para o contrato wire (reais como number).
export function montarResumoCaixa(totais: TotaisCaixaCentavos): ResumoCaixa {
  return {
    totalEntradas: deCentavos(totais.entradas),
    totalTransferencias: deCentavos(totais.transferencias),
    totalTransferenciasEntrada: deCentavos(totais.transferenciasEntrada),
    totalTransferenciasSaida: deCentavos(totais.transferenciasSaida),
    totalDespesas: deCentavos(totais.despesas),
    totalRetiradas: deCentavos(totais.retiradas),
    totalMercadorias: deCentavos(totais.mercadorias),
    saldo: deCentavos(saldoCaixaCentavos(totais))
  };
}
export type CaixaStatus = z.infer<typeof caixaStatusSchema>;
export type AcertoSaldoCaixaResponse = z.infer<typeof acertoSaldoCaixaResponseSchema>;
export type SolicitarAutorizacaoCaixaPayload = z.infer<typeof solicitarAutorizacaoCaixaPayloadSchema>;
export type AlterarHorarioCaixaPayload = z.infer<typeof alterarHorarioCaixaPayloadSchema>;
export type AlterarHorarioCaixaResponse = z.infer<typeof alterarHorarioCaixaResponseSchema>;
export type AutorizadorCaixa = z.infer<typeof autorizadorCaixaSchema>;
export type SolicitacaoAutorizacaoCaixa = z.infer<typeof solicitacaoAutorizacaoCaixaSchema>;
export type AutorizacoesCaixaQuery = z.infer<typeof autorizacoesCaixaQuerySchema>;
export type AutorizacaoCaixaParams = z.infer<typeof autorizacaoCaixaParamsSchema>;
