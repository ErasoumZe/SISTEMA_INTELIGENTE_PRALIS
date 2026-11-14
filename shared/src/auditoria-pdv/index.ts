import { z } from "zod";

// Auditoria de PDVs (Marco, 13/11/2026). Por dia, cruza as vendas da CREARE com os caixas abertos no sistema:
// "PDV 1 · Manhã bateu (6 vendas, R$ 4.878,91)". Venda que nao caiu em nenhum caixa e alerta.

const dataSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "Data no formato AAAA-MM-DD");
const uuidSchema = z.string().uuid();

export const auditoriaCalendarioQuerySchema = z.object({
  empresaId: uuidSchema,
  inicio: dataSchema,
  fim: dataSchema
});

export const auditoriaDiaQuerySchema = z.object({ empresaId: uuidSchema, data: dataSchema });

export const gerarAuditoriaPayloadSchema = z.object({ empresaId: uuidSchema, data: dataSchema });

export const agendaAuditoriaPayloadSchema = z.object({
  empresaId: uuidSchema,
  ativa: z.boolean(),
  horario: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/u, "Horario no formato HH:MM")
});

export type AgendaAuditoriaPayload = z.infer<typeof agendaAuditoriaPayloadSchema>;

// ok = todas as vendas cairam em caixa e os caixas do dia fecharam; alerta = venda fora de caixa;
// andamento = ainda tem caixa aberto (o dia nao terminou); sem_vendas = nenhuma venda da CREARE.
export type StatusAuditoria = "ok" | "alerta" | "andamento" | "sem_vendas";

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
