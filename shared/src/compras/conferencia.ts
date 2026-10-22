import { z } from "zod";
import {
  regraRecorrenciaSchema,
  terminoRecorrenciaSchema,
  type RegraRecorrencia,
  type TerminoRecorrencia
} from "./recorrencia.js";

// Conferencia de estoque agendada (doc 57 §1, José 22/10/2026): a mesma recorrencia do agendamento de pedido,
// recortada por grupo/subgrupo, ranking (mais vendidos / mais comprados / mais lucro), area e locais. Na data,
// nasce a conferencia com a lista de produtos e o saldo do sistema, e o responsavel e avisado no sino. A
// contagem SO REGISTRA: nao mexe no estoque (decisao de 22/10).

export const rankingsConferencia = ["mais_vendidos", "mais_comprados", "mais_lucro"] as const;
export type RankingConferencia = (typeof rankingsConferencia)[number];

export const ROTULO_RANKING_CONFERENCIA: Record<RankingConferencia, string> = {
  mais_vendidos: "Mais vendidos",
  mais_comprados: "Mais comprados",
  mais_lucro: "Mais lucro"
};

const uuid = z.string().uuid();
const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "Data inválida");
const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/u, "Hora inválida");
const textoOpcional = z.string().trim().max(120).optional().nullable();

export const conferenciaAgendaPayloadSchema = z.object({
  empresaId: uuid,
  responsavelId: z.string().trim().min(1).max(200),
  grupoMercadoriaId: uuid.optional().nullable(),
  ranking: z.enum(rankingsConferencia).optional().nullable(),
  areaEstoque: textoOpcional,
  localEstoque: textoOpcional,
  localVenda: textoOpcional,
  inicioData: dataIso,
  inicioHora: hora,
  regra: regraRecorrenciaSchema,
  termino: terminoRecorrenciaSchema,
  observacao: z.string().trim().max(1_000).optional().nullable()
});

export const conferenciasQuerySchema = z.object({ empresaId: uuid });
export const conferenciaEmpresaSchema = z.object({ empresaId: uuid });

/** Contagem: item a item; vazio (null) = ainda nao contado. Salvar varias vezes e normal. */
export const contagemConferenciaPayloadSchema = z.object({
  empresaId: uuid,
  itens: z
    .array(z.object({ itemId: uuid, quantidadeContada: z.number().nonnegative().max(9_999_999).nullable() }))
    .min(1)
    .max(2_000)
});

export type ConferenciaAgendaPayload = z.infer<typeof conferenciaAgendaPayloadSchema>;
export type ContagemConferenciaPayload = z.infer<typeof contagemConferenciaPayloadSchema>;

/** O recorte, como aparece no cartao da conferencia (grupo / ranking / area / locais). */
export type RecorteConferenciaDto = {
  grupoMercadoriaId: string | null;
  grupo: string | null;
  ranking: RankingConferencia | null;
  areaEstoque: string | null;
  localEstoque: string | null;
  localVenda: string | null;
};

export type ConferenciaAgendaDto = RecorteConferenciaDto & {
  id: string;
  responsavelId: string;
  responsavelNome: string;
  inicioData: string;
  inicioHora: string;
  regra: RegraRecorrencia;
  termino: TerminoRecorrencia;
  resumo: string;
  observacao: string | null;
  /** Proximas datas (ISO), ate 6. */
  proximas: string[];
};

export type ConferenciaResumoDto = RecorteConferenciaDto & {
  id: string;
  agendaId: string | null;
  data: string;
  status: "agendada" | "cancelada" | "concluida";
  responsavelId: string | null;
  responsavelNome: string | null;
  totalItens: number;
  contados: number;
  concluidaEm: string | null;
  observacao: string | null;
};

export type ConferenciaItemDto = {
  itemId: string;
  produtoId: string;
  descricao: string;
  grupo: string | null;
  unidade: string | null;
  saldoSistema: string;
  quantidadeContada: string | null;
};

export type ConferenciaDetalheDto = ConferenciaResumoDto & { itens: ConferenciaItemDto[] };

export type ResponsavelConferenciaDto = { usuarioId: string; nome: string };

/** Opcoes do formulario de agenda: grupos (com o pai), areas e locais que existem nos produtos, e quem conta. */
export type OpcoesConferenciaDto = {
  grupos: Array<{ id: string; nome: string; grupoPaiId: string | null }>;
  areas: string[];
  locaisEstoque: string[];
  locaisVenda: string[];
  responsaveis: ResponsavelConferenciaDto[];
};
