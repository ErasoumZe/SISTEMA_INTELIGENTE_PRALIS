import { z } from "zod";

// Comandas do CREARE (Marco, 25/11/2026 — R-248). O robo da loja le o MySQL do CREARE (so leitura) e manda as
// comandas para o S1; o S2 (sistema do Rodrigo) mostra o painel "VND - Sistema comandas" lendo do S1.
// STATUS_COMANDA do CREARE (deduzido, nao documentado): 1 aberta recebendo itens; 2 puxada pelo caixa,
// esperando pagamento; 3 cancelada; 4 desconhecido (antigas, nunca fechadas); 5 fechada (virou venda).

export const STATUS_COMANDA = { aberta: 1, puxada: 2, cancelada: 3, desconhecido: 4, fechada: 5 } as const;
export const STATUS_COMANDA_EM_ABERTO = [1, 2, 4] as const;

export const LIMITE_COMANDAS_POR_LOTE = 100;
export const LIMITE_ITENS_POR_COMANDA = 300;
// As status 4 so acumulam (117 em 25/11/2026): folga larga para o retrato nunca ser recusado.
export const LIMITE_IDS_ABERTOS = 20_000;
// Retencao no S1 (Marco, 25/11/2026): fechadas e canceladas ficam 1 ano.
export const RETENCAO_COMANDAS_DIAS = 365;

// Limites de tempo da situacao (Marco, 25/11/2026). Pagar depois de puxar leva ~30 s; puxada parada ha mais
// de 1 h e venda abandonada. Sem lancamento ha mais de 24 h e comanda esquecida.
export const LIMITE_ABANDONADA_MS = 60 * 60 * 1000;
export const LIMITE_ESQUECIDA_MS = 24 * 60 * 60 * 1000;

const instante = z.string().datetime({ offset: true });
const instanteOpcional = instante.nullable().default(null);
// Texto do CREARE: aparado e cortado no limite da coluna, nunca recusado por ser longo.
const texto = (max: number) => z.string().transform((valor) => valor.trim().slice(0, max));
const textoOpcional = (max: number) =>
  z
    .string()
    .nullable()
    .default(null)
    .transform((valor) => {
      const limpo = valor?.trim().slice(0, max) ?? "";
      return limpo || null;
    });
// Dinheiro em reais com 2 casas, como o CREARE guarda (DECIMAL). Vira centavos inteiros no S1.
const dinheiro = z.number().finite().min(-99_999_999).max(99_999_999);
const idCreare = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

export const itemComandaCreareSchema = z.object({
  idItem: idCreare,
  produtoCodigo: textoOpcional(40),
  descricao: texto(200),
  quantidade: z.number().finite().min(-99_999).max(99_999),
  valorTotal: dinheiro,
  funcionarioCodigo: textoOpcional(40),
  funcionarioNome: textoOpcional(120),
  cancelado: z.boolean(),
  motivoCancelamento: textoOpcional(200),
  lancadoEm: instanteOpcional
});

export const comandaCreareSchema = z.object({
  idComanda: idCreare,
  numero: z.number().int().min(0).max(9_999_999),
  mesa: z.number().int().min(0).max(9_999_999).nullable().default(null),
  status: z.number().int().min(0).max(99),
  abertaEm: instanteOpcional,
  ultimoLancamentoEm: instanteOpcional,
  puxadaEm: instanteOpcional,
  fechadaEm: instanteOpcional,
  valorSubtotal: dinheiro,
  valorDesconto: dinheiro,
  valorTotal: dinheiro,
  nomeCliente: textoOpcional(120),
  observacao: textoOpcional(500),
  vendaCreareId: idCreare.nullable().default(null),
  vendaValorTotal: dinheiro.nullable().default(null),
  itens: z.array(itemComandaCreareSchema).max(LIMITE_ITENS_POR_COMANDA)
});

export const loteComandasCreareSchema = z.object({
  comandas: z.array(comandaCreareSchema).max(LIMITE_COMANDAS_POR_LOTE)
});

// Retrato do ciclo: os IDs que o CREARE tem em aberto agora (status 1, 2 e 4). O S1 responde quais ele ainda tem
// em aberto e o CREARE nao (fecharam ou foram canceladas: o robo rele pela PK) e o maior ID que ja recebeu (o
// robo le as novas a partir dele). Assim o robo nao guarda estado das comandas.
export const retratoComandasCreareSchema = z.object({
  abertasIds: z.array(idCreare).max(LIMITE_IDS_ABERTOS)
});

export type ItemComandaCreare = z.infer<typeof itemComandaCreareSchema>;
export type ComandaCreare = z.infer<typeof comandaCreareSchema>;
export type LoteComandasCreare = z.infer<typeof loteComandasCreareSchema>;
export type RetratoComandasCreare = z.infer<typeof retratoComandasCreareSchema>;

export type RetratoComandasResposta = { maiorIdComanda: number | null; conferirIds: number[] };
export type LoteComandasResposta = { recebidas: number; gravadas: number; semMudanca: number };

/* ---------- Situacao ---------- */

export const SITUACOES_COMANDA = [
  "aberta",
  "puxada",
  "abandonada",
  "conta",
  "esquecida",
  "fechada",
  "cancelada"
] as const;
export type SituacaoComanda = (typeof SITUACOES_COMANDA)[number];

export type TemposComanda = {
  status: number;
  abertaEm: string | null;
  ultimoLancamentoEm: string | null;
  puxadaEm: string | null;
  // Itens validos (nao cancelados). Comanda sem item valido nunca e "conta" (25/11/2026).
  itensValidos?: number;
};

const ms = (valor: string | null): number | null => {
  if (!valor) return null;
  const instanteMs = Date.parse(valor);
  return Number.isNaN(instanteMs) ? null : instanteMs;
};

/**
 * Situacao da comanda agora (R-248):
 * - 5 fechada; 3 cancelada; 4 esquecida (antigas, nunca fechadas).
 * - 1/2 sem lancamento ha mais de 24 h: esquecida.
 * - 1/2 aberta ha mais de 24 h mas ainda recebendo itens: "conta" (acumula itens por dias, como as comandas 1 e
 *   430). Fica fora do alerta de abandonada. Regra generica, sem numero fixo.
 * - 1/2 aberta ha mais de 24 h SEM item valido (so cancelados ou nenhum): esquecida, nunca "conta". O CREARE mexe na
 *   hora do item e no ultimo lancamento quando a linha muda (cancelar), entao essas horas nao provam uso (25/11/2026).
 * - 2 puxada ha mais de 1 h: abandonada. A hora de puxar vem do log do CREARE; sem ela, o ultimo lancamento.
 * - 2 puxada; 1 aberta.
 */
export function situacaoComanda(comanda: TemposComanda, agora: Date = new Date()): SituacaoComanda {
  if (comanda.status === STATUS_COMANDA.fechada) return "fechada";
  if (comanda.status === STATUS_COMANDA.cancelada) return "cancelada";
  if (comanda.status === STATUS_COMANDA.desconhecido) return "esquecida";
  const agoraMs = agora.getTime();
  const abertaMs = ms(comanda.abertaEm);
  const ultimoMs = ms(comanda.ultimoLancamentoEm) ?? abertaMs;
  if (ultimoMs !== null && agoraMs - ultimoMs > LIMITE_ESQUECIDA_MS) return "esquecida";
  if (abertaMs !== null && agoraMs - abertaMs > LIMITE_ESQUECIDA_MS) {
    return comanda.itensValidos === 0 ? "esquecida" : "conta";
  }
  if (comanda.status === STATUS_COMANDA.puxada) {
    const puxadaMs = ms(comanda.puxadaEm) ?? ultimoMs;
    return puxadaMs !== null && agoraMs - puxadaMs > LIMITE_ABANDONADA_MS ? "abandonada" : "puxada";
  }
  return "aberta";
}

/** Segundos entre dois instantes (null se faltar um deles ou se o fim vier antes do inicio). */
export function segundosEntre(inicio: string | null, fim: string | null): number | null {
  const a = ms(inicio);
  const b = ms(fim);
  if (a === null || b === null || b < a) return null;
  return Math.round((b - a) / 1000);
}

/* ---------- Leitura pelo S2 ---------- */

const dataSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, "Data no formato AAAA-MM-DD")
  .refine((d) => {
    const instanteMs = Date.parse(`${d}T00:00:00Z`);
    return !Number.isNaN(instanteMs) && new Date(instanteMs).toISOString().slice(0, 10) === d;
  }, "Data inexistente");
const opcional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((valor) => (valor === "" || valor === null ? undefined : valor), schema.optional());

export const ABAS_COMANDAS = ["abertas", "fechadas", "status4"] as const;
export type AbaComandas = (typeof ABAS_COMANDAS)[number];

export const comandasConsultaSchema = z.object({
  aba: z.enum(ABAS_COMANDAS).default("abertas"),
  // Fechadas: o dia do fechamento (padrao hoje). Abertas e status 4 ignoram o dia: aberta e aberta agora.
  dia: opcional(dataSchema),
  situacao: opcional(z.enum(SITUACOES_COMANDA)),
  funcionario: opcional(z.string().trim().min(1).max(40)),
  numero: opcional(z.coerce.number().int().min(0).max(9_999_999)),
  pagina: z.coerce.number().int().min(1).max(10_000).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(50)
});
export type ComandasConsulta = z.infer<typeof comandasConsultaSchema>;

export const comandasIndicadoresSchema = z.object({ dia: opcional(dataSchema) });

export type ComandaResumo = {
  idComanda: number;
  numero: number;
  mesa: number | null;
  status: number;
  situacao: SituacaoComanda;
  abertaEm: string | null;
  ultimoLancamentoEm: string | null;
  puxadaEm: string | null;
  // true quando a hora de puxar nao veio do log do CREARE (a tela usa o ultimo lancamento e avisa).
  puxadaAproximada: boolean;
  fechadaEm: string | null;
  // Aberta: ate agora. Fechada: ate fechar.
  segundosAberta: number | null;
  itensValidos: number;
  itensCancelados: number;
  valorTotalCentavos: number;
  valorVendaCentavos: number | null;
  diferencaVendaCentavos: number | null;
  lancadoPor: string | null;
  nomeCliente: string | null;
};

export type ItemComandaDetalhe = {
  idItem: number;
  produtoCodigo: string | null;
  descricao: string;
  quantidade: number;
  valorTotalCentavos: number;
  funcionario: string | null;
  cancelado: boolean;
  motivoCancelamento: string | null;
  lancadoEm: string | null;
};

export type EventoLinhaDoTempo = {
  tipo: "abriu" | "item" | "item_cancelado" | "puxada" | "fechada" | "cancelada";
  em: string;
  texto: string;
};

export type ComandaDetalhe = ComandaResumo & {
  observacao: string | null;
  vendaCreareId: number | null;
  valorSubtotalCentavos: number;
  valorDescontoCentavos: number;
  itens: ItemComandaDetalhe[];
  linhaDoTempo: EventoLinhaDoTempo[];
};

export type ComandasIndicadores = {
  // Hora em que o robo mandou o ultimo retrato (null: o robo ainda nao mandou nenhum).
  retratoEm: string | null;
  abertasAgora: number;
  puxadasAgora: number;
  abandonadas: number;
  contas: number;
  esquecidas: number;
  // Comandas em status 4 (antigas, nunca fechadas): o contador da aba.
  status4: number;
  valorEmAbertoCentavos: number;
  dia: string;
  fechadasNoDia: number;
  valorFechadoNoDiaCentavos: number;
  tempoMedioAbertaSegundos: number | null;
  tempoMedioPuxadaPagaSegundos: number | null;
  diferentesDaVendaNoDia: number;
};

const moedaBr = (centavos: number) => (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Linha do tempo do detalhe: abriu -> itens lancados (e cancelados) -> puxada no caixa -> paga/cancelada. */
export function montarLinhaDoTempo(
  comanda: Pick<ComandaResumo, "status" | "abertaEm" | "puxadaEm" | "puxadaAproximada" | "fechadaEm">,
  itens: ItemComandaDetalhe[]
): EventoLinhaDoTempo[] {
  const eventos: EventoLinhaDoTempo[] = [];
  if (comanda.abertaEm) eventos.push({ tipo: "abriu", em: comanda.abertaEm, texto: "Comanda aberta" });
  for (const item of itens) {
    if (!item.lancadoEm) continue;
    const quem = item.funcionario ? ` por ${item.funcionario}` : "";
    eventos.push({
      tipo: item.cancelado ? "item_cancelado" : "item",
      em: item.lancadoEm,
      texto: `${item.descricao} · ${moedaBr(item.valorTotalCentavos)}${quem}${item.cancelado ? " (cancelado)" : ""}`
    });
  }
  if (comanda.puxadaEm && !comanda.puxadaAproximada) {
    eventos.push({ tipo: "puxada", em: comanda.puxadaEm, texto: "Puxada no caixa" });
  }
  if (comanda.fechadaEm && comanda.status === STATUS_COMANDA.fechada) {
    eventos.push({ tipo: "fechada", em: comanda.fechadaEm, texto: "Paga no caixa" });
  } else if (comanda.fechadaEm && comanda.status === STATUS_COMANDA.cancelada) {
    eventos.push({ tipo: "cancelada", em: comanda.fechadaEm, texto: "Comanda cancelada" });
  }
  return eventos.sort((a, b) => Date.parse(a.em) - Date.parse(b.em));
}
