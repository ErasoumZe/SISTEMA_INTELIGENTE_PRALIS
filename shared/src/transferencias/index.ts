import { z } from "zod";
import { paginationQuerySchema } from "../api/index.js";

const uuidSchema = z.string().uuid();
const dinheiroSchema = z.coerce.number().min(0);
export const tempoConfirmacaoSchema = z.enum(["5min", "10min", "30min", "1h", "1dia", "10dias", "30dias"]);
export type TempoConfirmacao = z.infer<typeof tempoConfirmacaoSchema>;

export const transferenciasQuerySchema = z
  .object({
    empresaId: uuidSchema.optional(),
    caixaId: uuidSchema.optional()
  })
  .merge(paginationQuerySchema);

export const transferenciaPayloadSchema = z.object({
  empresaId: uuidSchema,
  dataReferencia: z.string().min(10),
  // R-127: o texto do movimento e a OBSERVACAO. `descricao` continua ACEITA (compatibilidade com
  // chamada antiga) mas nao e exigida — o servidor grava o que vier em observacao, ou a descricao
  // como reserva, e recusa quando os dois vem vazios.
  descricao: z.string().optional().nullable(),
  observacao: z.string().optional().nullable(),
  valorOriginal: dinheiroSchema,
  valorAcrescimo: dinheiroSchema.default(0),
  descricaoAcrescimo: z.string().optional().nullable(),
  valorDesconto: dinheiroSchema.default(0),
  descricaoDesconto: z.string().optional().nullable(),
  contaOrigemId: uuidSchema,
  contaDestinoId: uuidSchema,
  contasDestinoIds: z.array(uuidSchema).max(50).optional().default([]),
  nLacreDoc: z.string().trim().min(1).optional().nullable(),
  agendadaPara: z.string().datetime().optional().nullable(),
  tempoConfirmacao: tempoConfirmacaoSchema.optional().default("1dia"),
  computar: z.boolean().default(true)
});

export const transferenciaDtoSchema = z.object({
  id: z.string(),
  empresaId: z.string(),
  dataReferencia: z.string(),
  descricao: z.string(),
  valorOriginal: z.string(),
  computar: z.boolean(),
  status: z.enum(["pendente", "recebido", "agendada", "cancelada"]),
  contaOrigemId: z.string(),
  contaDestinoId: z.string(),
  contaOrigemNome: z.string(),
  contaDestinoNome: z.string(),
  nLacreDoc: z.string().nullable(),
  prazoConfirmacaoEm: z.string().nullable(),
  dataRecebimento: z.string().nullable(),
  confirmadoPor: z.string().nullable()
});

export const confirmarTransferenciaPayloadSchema = z.object({
  contaDestinoId: uuidSchema,
  nLacreDoc: z.string().trim().min(1),
  valorRecebido: dinheiroSchema.optional()
});

export type ConfirmarTransferenciaPayload = z.infer<typeof confirmarTransferenciaPayloadSchema>;

const minutosPorPrazo: Record<TempoConfirmacao, number> = {
  "5min": 5,
  "10min": 10,
  "30min": 30,
  "1h": 60,
  "1dia": 1440,
  "10dias": 14400,
  "30dias": 43200
};

export function calcularPrazoConfirmacao(inicio: Date, prazo: TempoConfirmacao): Date {
  return new Date(inicio.getTime() + minutosPorPrazo[prazo] * 60_000);
}

export const transferenciaCriadaSchema = z.object({
  id: z.string(),
  computar: z.boolean()
});

export type TransferenciasQuery = z.input<typeof transferenciasQuerySchema>;
export type TransferenciaPayload = z.infer<typeof transferenciaPayloadSchema>;

// Detalhe para edicao: payload completo (com filhos) + identificacao do registro.
export type TransferenciaDetalheDto = TransferenciaPayload & {
  id: string;
  status: string;
  caixaId: string | null;
  prazoConfirmacaoEm: string | null;
  dataRecebimento: string | null;
  confirmadoPor: string | null;
};
export type TransferenciaDto = z.infer<typeof transferenciaDtoSchema>;
export type TransferenciaCriada = z.infer<typeof transferenciaCriadaSchema>;
