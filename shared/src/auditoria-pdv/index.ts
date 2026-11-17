import { z } from "zod";

// Auditoria de PDVs (Marco, 13/11/2026). Por dia, cruza as vendas da CREARE com os caixas abertos no sistema:
// "PDV 1 · Manhã bateu (6 vendas, R$ 4.878,91)". Venda que nao caiu em nenhum caixa e alerta.

// Data de calendario de verdade: 2026-02-31 cai aqui (400), em vez de estourar no banco (500).
const dataSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, "Data no formato AAAA-MM-DD")
  .refine((d) => {
    const instante = Date.parse(`${d}T00:00:00Z`);
    return !Number.isNaN(instante) && new Date(instante).toISOString().slice(0, 10) === d;
  }, "Data inexistente");
const uuidSchema = z.string().uuid();

const horaSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/u, "Horario no formato HH:MM");
const opcional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((valor) => (valor === "" || valor === null ? undefined : valor), schema.optional());

export const STATUS_AUDITORIA = ["ok", "alerta", "andamento", "sem_vendas"] as const;
export const FORMAS_AUDITORIA = ["dinheiro", "credito", "debito", "pix", "voucher", "crediario", "outros"] as const;

// Consulta com filtros (Marco, 14/11/2026): periodo, PDV, turno, faixa de hora, forma de pagamento e situacao.
export const auditoriaConsultaQuerySchema = z
  .object({
    empresaId: uuidSchema,
    inicio: dataSchema,
    fim: dataSchema,
    pdvId: opcional(uuidSchema),
    turno: opcional(z.enum(["manha", "tarde"])),
    horaInicio: opcional(horaSchema),
    horaFim: opcional(horaSchema),
    forma: opcional(z.enum(FORMAS_AUDITORIA)),
    status: opcional(z.enum(STATUS_AUDITORIA))
  })
  .refine((q) => q.inicio <= q.fim, { message: "Data inicial depois da final", path: ["fim"] })
  .refine((q) => !q.horaInicio || !q.horaFim || q.horaInicio <= q.horaFim, {
    message: "Hora inicial depois da final",
    path: ["horaFim"]
  });

export type AuditoriaConsultaQuery = z.infer<typeof auditoriaConsultaQuerySchema>;

export const auditoriaEmpresaQuerySchema = z.object({ empresaId: uuidSchema });

export const gerarAuditoriaPayloadSchema = z.object({ empresaId: uuidSchema, data: dataSchema });

export const agendaAuditoriaPayloadSchema = z.object({
  empresaId: uuidSchema,
  ativa: z.boolean(),
  horario: horaSchema
});

export type AgendaAuditoriaPayload = z.infer<typeof agendaAuditoriaPayloadSchema>;

// ok = todas as vendas cairam em caixa e os caixas do dia fecharam; alerta = venda fora de caixa;
// andamento = ainda tem caixa aberto (o dia nao terminou); sem_vendas = nenhuma venda da CREARE.
export type StatusAuditoria = (typeof STATUS_AUDITORIA)[number];

export type AuditoriaDiaResumo = {
  data: string;
  status: StatusAuditoria;
  vendas: number;
  total: number;
  vendasFora: number;
  valorFora: number;
  gerada: { em: string; automatica: boolean } | null;
};

export type FormaAuditoria = { categoria: string; valor: number };

export type CaixaAuditoria = {
  caixaId: string;
  turno: "manha" | "tarde" | null;
  operador: string | null;
  abertura: string | null;
  fechamento: string | null;
  status: string;
  vendas: number;
  total: number;
  formas: FormaAuditoria[];
};

export type VendaForaAuditoria = {
  vendaId: string;
  hora: string | null;
  valor: number;
  formas: FormaAuditoria[];
  produtos: Array<{ descricao: string; quantidade: number }>;
};

export type PdvAuditoria = {
  pdvId: string | null;
  pdvNome: string;
  status: StatusAuditoria;
  vendas: number;
  total: number;
  caixas: CaixaAuditoria[];
  fora: VendaForaAuditoria[];
};

export type AuditoriaDia = AuditoriaDiaResumo & { pdvs: PdvAuditoria[] };

export type ConsultaAuditoria = {
  resumo: { vendas: number; total: number; vendasFora: number; valorFora: number };
  dias: AuditoriaDia[];
  pdvs: Array<{ id: string; nome: string }>;
};

export type AgendaAuditoria = { ativa: boolean; horario: string };

// Status de um PDV no dia: venda fora de caixa manda; depois, caixa ainda aberto; depois, sem venda.
export function statusAuditoria(entrada: {
  vendas: number;
  vendasFora: number;
  caixasAbertos: number;
}): StatusAuditoria {
  if (entrada.vendasFora > 0) return "alerta";
  if (entrada.caixasAbertos > 0) return "andamento";
  if (entrada.vendas === 0) return "sem_vendas";
  return "ok";
}

// O dia herda o pior status entre os PDVs.
export function statusDoDia(statuses: StatusAuditoria[]): StatusAuditoria {
  if (statuses.includes("alerta")) return "alerta";
  if (statuses.includes("andamento")) return "andamento";
  if (statuses.includes("ok")) return "ok";
  return "sem_vendas";
}
