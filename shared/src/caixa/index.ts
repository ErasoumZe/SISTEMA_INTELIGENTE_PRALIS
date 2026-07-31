import { z } from "zod";
import { paginationQuerySchema } from "../api/index.js";
import { deCentavos } from "../dinheiro/index.js";
import { saldoCaixaCentavos, saldoProprioCentavos, type TotaisCaixaCentavos } from "./regras.js";

export * from "./regras.js";

const uuidSchema = z.string().uuid();
const dataHoraSchema = z.string().min(16);
const dataSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "data deve ser YYYY-MM-DD");

export const caixaStatusQuerySchema = z.object({
  empresaId: uuidSchema
});

export const abrirCaixaPayloadSchema = z.object({
  empresaId: uuidSchema,
  pdvId: uuidSchema,
  usuarioCaixaId: z.string().min(1),
  dataHoraAbertura: dataHoraSchema,
  // Turno da abertura: se ausente, o servidor usa o turno padrao do colaborador.
  turnoId: uuidSchema.optional().nullable(),
  // Malote selecionado na abertura (R8): o servidor cria a transferencia cofre -> caixa pelo valor
  // do malote e inicia o caixa em deficit. Opcional (abrir sem malote continua valido).
  maloteId: uuidSchema.optional().nullable(),
  // R-039: equipamento usado neste PDV/turno. Opcional por decisao de negocio.
  maquininhaId: uuidSchema.optional().nullable(),
  // Lacre da IDA (D1/D5): preenchimento opcional por enquanto; o campo ja existe.
  lacreAbertura: z.string().trim().min(1).optional().nullable(),
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

export const fecharCaixaPayloadSchema = z.object({
  observacao: z.string().optional().nullable()
});

// Status gravados pelo sistema hoje: "aberto" (abertura) e "fechado" (fechamento). "ajustado" e
// aceito pela constraint do banco e existe no seed, mas NENHUM fluxo o escreve — o acerto de saldo
// cria despesa/debito/ajuste e mantem o caixa aberto. Quem quer "houve acerto" usa temAjuste.
export const statusCaixaSchema = z.enum(["aberto", "fechado", "ajustado"]);

// Filtros do historico. Periodo e por data_movimento (a data contabil do caixa), nao por
// data_hora_abertura: e ela que o operador enxerga como "o dia daquele caixa".
export const historicoCaixaQuerySchema = z
  .object({
    empresaId: uuidSchema,
    dataInicio: dataSchema.optional(),
    dataFim: dataSchema.optional(),
    pdvId: uuidSchema.optional(),
    usuarioCaixaId: z.string().min(1).optional(),
    colaboradorId: uuidSchema.optional(),
    turnoId: uuidSchema.optional(),
    status: statusCaixaSchema.optional()
  })
  .merge(paginationQuerySchema);

export const totaisHistoricoCaixaSchema = z.object({
  totalEntradas: z.number(),
  totalTransferenciasEntrada: z.number(),
  totalTransferenciasSaida: z.number(),
  totalDespesas: z.number(),
  totalRetiradas: z.number(),
  totalMercadorias: z.number(),
  saldo: z.number(),
  caixas: z.number()
});

// Uma linha da listagem. Totais vem persistidos de fechamentos_caixa (nao recalculamos);
// para caixa ainda aberto eles sao 0 ate o fechamento gravar — a UI marca isso.
export const linhaHistoricoCaixaSchema = z.object({
  id: uuidSchema,
  empresaId: uuidSchema,
  dataMovimento: z.string(),
  pdvId: uuidSchema.nullable(),
  pdvNome: z.string(),
  usuarioCaixaId: z.string().nullable(),
  usuarioCaixaNome: z.string().nullable(),
  colaboradorId: uuidSchema,
  colaboradorNome: z.string().nullable(),
  turnoId: uuidSchema.nullable(),
  turnoNome: z.string().nullable(),
  dataHoraAbertura: z.string().nullable(),
  dataHoraFechamento: z.string().nullable(),
  fechadoPor: z.string().nullable(),
  fechadoPorNome: z.string().nullable(),
  totalEntradas: z.number(),
  totalTransferencias: z.number(),
  totalTransferenciasEntrada: z.number(),
  totalTransferenciasSaida: z.number(),
  totalDespesas: z.number(),
  totalRetiradas: z.number(),
  totalMercadorias: z.number(),
  saldo: z.number(),
  status: statusCaixaSchema,
  temAjuste: z.boolean(),
  alteradoAposFechamento: z.boolean(),
  observacao: z.string().nullable()
});

export const historicoCaixaResponseSchema = z.object({
  itens: z.array(linhaHistoricoCaixaSchema),
  totais: totaisHistoricoCaixaSchema
});

// --- Detalhe de um caixa (auditoria) ------------------------------------------------------------
export const edicaoHorarioCaixaSchema = z.object({
  id: uuidSchema,
  editadoPor: z.string().nullable(),
  editadoPorNome: z.string().nullable(),
  autorizadorId: z.string().nullable(),
  autorizadorNome: z.string().nullable(),
  observacao: z.string().nullable(),
  editadoEm: z.string(),
  porToken: z.boolean(),
  valoresAntigos: z.object({ dataHoraAbertura: z.string().nullable(), dataHoraFechamento: z.string().nullable() }),
  valoresNovos: z.object({ dataHoraAbertura: z.string().nullable(), dataHoraFechamento: z.string().nullable() })
});

export const ajusteCaixaSchema = z.object({
  id: uuidSchema,
  valorDiferenca: z.number(),
  despesaId: uuidSchema.nullable(),
  criadoEm: z.string(),
  colaboradorId: uuidSchema.nullable(),
  colaboradorNome: z.string().nullable(),
  observacao: z.string().nullable()
});

export const lancamentoCaixaSchema = z.object({
  id: uuidSchema,
  descricao: z.string().nullable(),
  // Data CONTABIL do lancamento (date-only "yyyy-MM-dd", sem hora). A tela exibe com
  // formatarDataSomenteDia — passar por Date volta um dia em fuso negativo.
  data: z.string().nullable(),
  // Momento real, so em venda vinda da integracao (timestamp ISO). Quando existe, a tela mostra
  // data e hora reais no lugar da data contabil. Null em venda manual e nas demais categorias.
  dataHora: z.string().nullable(),
  valor: z.number(),
  // Transferencia: entrada ou saida em relacao a conta do PDV. Nas demais categorias fica null.
  sentido: z.enum(["entrada", "saida"]).nullable()
});

export const categoriaLancamentosCaixaSchema = z.object({
  categoria: z.enum(["entradas", "transferencias", "despesas", "retiradas", "mercadorias"]),
  titulo: z.string(),
  total: z.number(),
  itens: z.array(lancamentoCaixaSchema)
});

export const alteracaoPosFechamentoCaixaSchema = z.object({
  id: uuidSchema,
  vendaId: uuidSchema,
  identificadorExterno: z.string().nullable(),
  descricao: z.string(),
  valor: z.number(),
  dataVenda: z.string().nullable(),
  alteradoEm: z.string()
});

export const detalheCaixaResponseSchema = z.object({
  lancamentos: z.array(categoriaLancamentosCaixaSchema),
  alteracoesPosFechamento: z.array(alteracaoPosFechamentoCaixaSchema),
  edicoes: z.array(edicaoHorarioCaixaSchema),
  ajuste: ajusteCaixaSchema.nullable()
});

// --- Alteracao de horario por token / permissao direta -----------------------------------------
export const autorizacoesCaixaQuerySchema = z.object({ empresaId: uuidSchema });
export const autorizacaoCaixaParamsSchema = z.object({ autorizacaoId: uuidSchema });

// Operador (sem a permissao) solicita a alteracao escolhendo um autorizador com caixa_alterar_horario.
export const solicitarAutorizacaoCaixaPayloadSchema = z.object({
  autorizadorId: z.string().min(1),
  observacao: z.string().trim().max(500).optional().nullable()
});

// Alteracao do horario de abertura e/ou fechamento: token exigido para quem NAO tem a permissao;
// observacao SEMPRE obrigatoria (motivo), nos dois fluxos (token e permissao direta). Pelo menos um
// dos horarios deve ser informado.
export const alterarHorarioCaixaPayloadSchema = z
  .object({
    dataHoraAbertura: dataHoraSchema.optional(),
    dataHoraFechamento: dataHoraSchema.optional(),
    token: z.string().trim().optional(),
    observacao: z.string().trim().min(1, "Observacao obrigatoria").max(500)
  })
  .refine((dados) => dados.dataHoraAbertura !== undefined || dados.dataHoraFechamento !== undefined, {
    message: "Informe o novo horario de abertura e/ou fechamento"
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
  // saldo = saldo FISICO (formula canonica). dividaCofre = valor do malote emprestado na abertura
  // (0 sem malote). saldoProprio = saldo sob a otica da divida (R8): nasce em -dividaCofre e as
  // vendas em dinheiro o levam a zero; excedente e resultado do caixa.
  dividaCofre: z.number().optional(),
  saldoProprio: z.number().optional(),
  // propostaRetorno (R3/M2): sobra em especie a devolver ao cofre no fechamento (= saldo fisico se > 0).
  propostaRetorno: z.number().optional(),
  saldo: z.number()
});

// M2 — sangria (durante o turno) e retorno (no fechamento) sao a MESMA entidade (R4): transferencia
// caixa -> cofre. O servidor resolve a conta do cofre, a ordem e (opcional, D5) consome o lacre.
export const transferenciaCofrePayloadSchema = z.object({
  tipo: z.enum(["sangria", "retorno"]),
  valor: z.coerce.number().positive(),
  lacre: z.string().trim().min(1).optional().nullable(),
  observacao: z.string().trim().max(500).optional().nullable()
});

// M2 — visao "aba TRANSFERENCIAS" da planilha: por caixa+dia, os movimentos com ordem 1a/2a/3a/4a e
// os totais na OTICA DO COFRE (saida = cofre->caixa: abertura/suprimento; entrada = caixa->cofre:
// sangria/retorno). SALDO = ENTRADA - SAIDA (o que o caixa devolveu alem do fundo emprestado).
export const transferenciaCaixaLinhaSchema = z.object({
  id: uuidSchema,
  tipo: z.enum(["abertura", "suprimento", "sangria", "retorno"]),
  ordem: z.number().nullable(),
  valor: z.number(),
  sentido: z.enum(["saida", "entrada"]),
  lacre: z.string().nullable(),
  dataTransferencia: z.string().nullable()
});

export const transferenciasCaixaResponseSchema = z.object({
  itens: z.array(transferenciaCaixaLinhaSchema),
  totalSaida: z.number(),
  totalEntrada: z.number(),
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
  // Dia CONTABIL do caixa ("yyyy-MM-dd"), nao "hoje": num caixa que virou a meia-noite o dia do
  // operador continua sendo o da abertura. A tela de Entradas mostra este dia (S6/D7).
  dataMovimento: z.string(),
  dataHoraAbertura: z.string(),
  abertoEm: z.string(),
  dataHoraFechamento: z.string().nullable(),
  fechadoEm: z.string().nullable(),
  tokenEdicao: z.string().nullable(),
  turnoId: z.string().nullable(),
  maquininhaId: uuidSchema.nullable(),
  maquininhaApelido: z.string().nullable(),
  maquininhaNumeroSerie: z.string().nullable(),
  observacao: z.string().nullable(),
  status: z.string()
});

export const caixaStatusSchema = z.object({
  caixaAberto: caixaOperacionalSchema.nullable(),
  resumo: resumoCaixaSchema.nullable()
});

export const alterarHorarioCaixaResponseSchema = caixaStatusSchema.extend({
  revinculacao: z.object({ anexadas: z.number(), desanexadas: z.number() })
});

export type CaixaStatusQuery = z.infer<typeof caixaStatusQuerySchema>;
export type AbrirCaixaPayload = z.infer<typeof abrirCaixaPayloadSchema>;
export type CaixaParams = z.infer<typeof caixaParamsSchema>;
export type EditarAberturaCaixaPayload = z.infer<typeof editarAberturaCaixaPayloadSchema>;
export type FecharCaixaPayload = z.infer<typeof fecharCaixaPayloadSchema>;
export type HistoricoCaixaQuery = z.infer<typeof historicoCaixaQuerySchema>;
export type StatusCaixa = z.infer<typeof statusCaixaSchema>;
export type LinhaHistoricoCaixa = z.infer<typeof linhaHistoricoCaixaSchema>;
export type TotaisHistoricoCaixa = z.infer<typeof totaisHistoricoCaixaSchema>;
export type HistoricoCaixaResponse = z.infer<typeof historicoCaixaResponseSchema>;
export type EdicaoHorarioCaixa = z.infer<typeof edicaoHorarioCaixaSchema>;
export type AjusteCaixa = z.infer<typeof ajusteCaixaSchema>;
export type LancamentoCaixa = z.infer<typeof lancamentoCaixaSchema>;
export type CategoriaLancamentosCaixa = z.infer<typeof categoriaLancamentosCaixaSchema>;
export type AlteracaoPosFechamentoCaixa = z.infer<typeof alteracaoPosFechamentoCaixaSchema>;
export type DetalheCaixaResponse = z.infer<typeof detalheCaixaResponseSchema>;
export type ResumoCaixa = z.infer<typeof resumoCaixaSchema>;
export type TransferenciaCofrePayload = z.infer<typeof transferenciaCofrePayloadSchema>;
export type TransferenciaCaixaLinha = z.infer<typeof transferenciaCaixaLinhaSchema>;
export type TransferenciasCaixaResponse = z.infer<typeof transferenciasCaixaResponseSchema>;
export type CaixaOperacional = z.infer<typeof caixaOperacionalSchema>;

// Converte os totais em centavos para o contrato wire (reais como number). dividaCofreCentavos vem
// do fechamento (valor do malote da abertura; 0 sem malote) e alimenta o saldo proprio derivado.
export function montarResumoCaixa(totais: TotaisCaixaCentavos, dividaCofreCentavos = 0): ResumoCaixa {
  return {
    totalEntradas: deCentavos(totais.entradas),
    totalTransferencias: deCentavos(totais.transferencias),
    totalTransferenciasEntrada: deCentavos(totais.transferenciasEntrada),
    totalTransferenciasSaida: deCentavos(totais.transferenciasSaida),
    totalDespesas: deCentavos(totais.despesas),
    totalRetiradas: deCentavos(totais.retiradas),
    totalMercadorias: deCentavos(totais.mercadorias),
    dividaCofre: deCentavos(dividaCofreCentavos),
    saldoProprio: deCentavos(saldoProprioCentavos(totais, dividaCofreCentavos)),
    propostaRetorno: deCentavos(Math.max(0, saldoCaixaCentavos(totais))),
    saldo: deCentavos(saldoCaixaCentavos(totais))
  };
}
export type CaixaStatus = z.infer<typeof caixaStatusSchema>;
export type SolicitarAutorizacaoCaixaPayload = z.infer<typeof solicitarAutorizacaoCaixaPayloadSchema>;
export type AlterarHorarioCaixaPayload = z.infer<typeof alterarHorarioCaixaPayloadSchema>;
export type AlterarHorarioCaixaResponse = z.infer<typeof alterarHorarioCaixaResponseSchema>;
export type AutorizadorCaixa = z.infer<typeof autorizadorCaixaSchema>;
export type SolicitacaoAutorizacaoCaixa = z.infer<typeof solicitacaoAutorizacaoCaixaSchema>;
export type AutorizacoesCaixaQuery = z.infer<typeof autorizacoesCaixaQuerySchema>;
export type AutorizacaoCaixaParams = z.infer<typeof autorizacaoCaixaParamsSchema>;
