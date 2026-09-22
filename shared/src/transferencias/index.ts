import { z } from "zod";
import { paginationQuerySchema } from "../api/index.js";

const uuidSchema = z.string().uuid();
const dinheiroSchema = z.coerce.number().min(0);
export const tempoConfirmacaoSchema = z.enum(["5min", "10min", "30min", "1h", "1dia", "10dias", "30dias"]);
export type TempoConfirmacao = z.infer<typeof tempoConfirmacaoSchema>;
// Um unico vocabulario para estado gravado, consulta e apresentacao. A lista de filtros da
// Tesouraria nao pode aceitar um status que o banco nunca devolvera (nem deixar de oferecer um
// status novo quando ele for acrescentado aqui).
export const statusTransferenciaSchema = z.enum(["pendente", "recebido", "agendada", "cancelada", "divergente"]);
export type StatusTransferencia = z.infer<typeof statusTransferenciaSchema>;

export const transferenciasQuerySchema = z
  .object({
    empresaId: uuidSchema.optional(),
    caixaId: uuidSchema.optional(),
    // Filtros da Tesouraria: todos sao aplicados no banco antes da paginacao.
    dataInicio: z.string().min(10).optional(),
    dataFim: z.string().min(10).optional(),
    pdvId: uuidSchema.optional(),
    usuario: z.string().trim().min(1).max(120).optional(),
    contaOrigemId: uuidSchema.optional(),
    contaDestinoId: uuidSchema.optional(),
    lacre: z.string().trim().min(1).max(100).optional(),
    // Filtro aplicado no banco antes da paginacao. Filtrar so as linhas ja visiveis esconderia
    // resultados das outras paginas e daria ao operador uma lista incompleta.
    status: statusTransferenciaSchema.optional()
  })
  .merge(paginationQuerySchema);
// R-185: envelopes preparados junto da ida Cofre -> Caixa. Sao apenas planejamento: a linha
// nasce agendada e so movimenta saldo quando o operador a executa dentro do Caixa.
export const retornoPlanejadoSchema = z
  .object({
    valor: z.coerce.number().positive(),
    nLacreDoc: z.string().trim().min(1, "Lacre obrigatorio")
  })
  .strict();

export const transferenciaPayloadSchema = z.object({
  empresaId: uuidSchema,
  dataReferencia: z.string().min(10),
  // R-127: o texto do movimento e a OBSERVACAO. `descricao` continua ACEITA (compatibilidade com
  // chamada antiga) mas nao e exigida — o servidor grava o que vier em observacao, ou a descricao
  // como reserva, e recusa quando os dois vem vazios.
  descricao: z.string().optional().nullable(),
  observacao: z.string().optional().nullable(),
  valorOriginal: dinheiroSchema,
  valorEspecieDeclarado: dinheiroSchema.optional(),
  valorMoedasDeclarado: dinheiroSchema.optional(),
  valorAcrescimo: dinheiroSchema.default(0),
  descricaoAcrescimo: z.string().optional().nullable(),
  valorDesconto: dinheiroSchema.default(0),
  descricaoDesconto: z.string().optional().nullable(),
  contaOrigemId: uuidSchema,
  contaDestinoId: uuidSchema,
  contasDestinoIds: z.array(uuidSchema).max(50).optional().default([]),
  nLacreDoc: z.string().trim().min(1).optional().nullable(),
  agendadaPara: z.string().datetime().optional().nullable(),
  tempoConfirmacao: tempoConfirmacaoSchema.nullable().optional().default(null),
  computar: z.boolean().default(true),
  retornosPlanejados: z.array(retornoPlanejadoSchema).max(20).optional().default([])
});

export const transferenciaDtoSchema = z.object({
  id: z.string(),
  empresaId: z.string(),
  dataReferencia: z.string(),
  descricao: z.string(),
  valorOriginal: z.string(),
  computar: z.boolean(),
  status: statusTransferenciaSchema,
  // R-183: o que o cofre contou. Null em tudo que nao e `divergente` — quem soma ENTRADA usa
  // este numero, senao o cockpit exibiria como recebido um valor que nunca chegou.
  valorRecebido: z.number().nullable(),
  contaOrigemId: z.string(),
  contaDestinoId: z.string(),
  contaOrigemNome: z.string(),
  contaDestinoNome: z.string(),
  caixaId: z.string().nullable(),
  pdvId: z.string().nullable(),
  pdvNome: z.string().nullable(),
  nLacreDoc: z.string().nullable(),
  prazoConfirmacaoEm: z.string().nullable(),
  dataRecebimento: z.string().nullable(),
  confirmadoPor: z.string().nullable(),
  criadoPor: z.string().nullable(),
  criadoPorNome: z.string().nullable(),
  criadoEm: z.string(),
  possuiPlanejamentoRetorno: z.boolean(),
  ehPlanejamentoRetorno: z.boolean(),
  // Esta linha esta sob as regras ESTRITAS da Transferencia de retorno (valor obrigatorio na conferencia,
  // divergencia vira recusa auditavel) ou sob o comportamento generico?
  //
  // Calculado pelo SERVIDOR, com o mesmo predicado canonico do `buscarContextoConferenciaRepository`
  // (caixa_id + tipo retorno/sangria). A tela nao tem como deduzir isso: ela nao conhece o tipo.
  // Sem este campo a tela tratava TODA transferencia como
  // se fosse do Caixa — exigia valor sempre e oferecia "Nao bateu" numa generica, onde a rota de
  // recusa responde 404.
  ehCaixaParaCofre: z.boolean()
});

// Decisao 9 (R-026): lacre e OPCIONAL no movimento, entao tem de ser opcional na conferencia.
// Antes era obrigatorio aqui, e o efeito pratico era grave: um movimento criado sem lacre nunca
// podia ser confirmado — nao havia numero para informar, e o repositorio exigia romper um lacre
// que nao existia. O dinheiro ficava `pendente` para sempre.
//
// Quando o movimento TEM lacre, informar o mesmo continua sendo obrigatorio: e ele que prova que
// o envelope conferido e aquele. Essa exigencia agora vive no servidor, que conhece o movimento.
export const confirmarTransferenciaPayloadSchema = z.object({
  contaDestinoId: uuidSchema,
  nLacreDoc: z.string().trim().min(1).optional().nullable(),
  valorRecebido: dinheiroSchema.optional()
});

export type ConfirmarTransferenciaPayload = z.infer<typeof confirmarTransferenciaPayloadSchema>;

// Decisao 8 — RECUSA de conferencia, exclusiva do fluxo Caixa -> Cofre.
//
// Endpoint proprio, e nao um desfecho do `/confirmar`, por uma razao pratica: a recusa precisa ser
// COMMITADA. Se ela vivesse dentro do confirmar e fosse sinalizada por excecao, o rollback apagaria
// justamente o registro auditavel que ela existe para criar.
//
// `motivo` obrigatorio: recusar dinheiro sem dizer por que nao e conferencia, e sumico com laudo.
// `valorRecebido`/`nLacreDoc` sao o que a pessoa CONTOU e LEU — guardados como divergiram.
//
// R-183 · `encerrar` transforma a recusa no DESFECHO. Sem ele (o default), o comportamento e o de
// sempre: registra a tentativa e mantem `pendente` para reconferencia. Com ele, a entrega vai para
// `divergente`, o cofre credita o contado e a falta vira quebra. Uma flag, e nao uma terceira rota:
// quem conta e o mesmo ator, o fato e o mesmo fato, e a trilha continua na mesma tabela.
//
// `sobraConfirmada` e o consentimento explicito do caso C > D. A D7 proibe transformar sobra em
// quebra positiva, entao o unico contrapeso possivel e alguem assumir por escrito que contou mais
// do que foi declarado — creditar o cofre a mais sem isso seria dinheiro entrando sem dono.
export const recusarConferenciaPayloadSchema = z.object({
  contaDestinoId: uuidSchema,
  motivo: z.string().trim().min(1, "Motivo obrigatorio").max(500),
  nLacreDoc: z.string().trim().min(1).optional().nullable(),
  valorRecebido: dinheiroSchema.optional(),
  encerrar: z.boolean().optional().default(false),
  sobraConfirmada: z.boolean().optional().default(false)
});

export type RecusarConferenciaPayload = z.infer<typeof recusarConferenciaPayloadSchema>;

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
  // R-183: o valor contado no cofre. Null em tudo que nao e `divergente`.
  valorRecebido: number | null;
  caixaId: string | null;
  prazoConfirmacaoEm: string | null;
  dataRecebimento: string | null;
  confirmadoPor: string | null;
};
export type TransferenciaDto = z.infer<typeof transferenciaDtoSchema>;
export type TransferenciaCriada = z.infer<typeof transferenciaCriadaSchema>;
