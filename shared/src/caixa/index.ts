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
  // R-039: equipamento usado neste PDV/turno. Opcional por decisao de negocio.
  maquininhaId: uuidSchema.optional().nullable(),
  // R-040: o lacre da IDA. Informa-lo E o ato de confirmar o recebimento da transferencia pendente
  // — o caixa vence a disputa (R-030), o dinheiro entra aqui e o lacre e rompido, tudo na mesma
  // transacao. Opcional porque a R-033 permite abrir zerado e receber o fundo depois.
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

// D6: o retorno final e o fechamento sao UM ato atomico. O cliente nao manda o VALOR do retorno —
// o servidor usa a sobra que ele mesmo apurou sob trava, para que nao exista janela entre o que a
// tela viu e o que o banco tem. O lacre e por movimento (D5) e continua opcional (R-026).
// Se a sobra ja for zero, a mesma acao apenas fecha; nao existe segundo botao.
export const fecharCaixaPayloadSchema = z.object({
  observacao: z.string().optional().nullable(),
  lacreRetorno: z.string().trim().min(1).optional().nullable()
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

// B2: a chave de idempotencia da INTENCAO. Obrigatoria em toda criacao avulsa/programada porque e
// a UNICA coisa que distingue "o operador quer entregar outros R$ 100" de "o POST anterior caiu na
// rede e o navegador reenviou". Trava e teto NAO resolvem isso: com saldo 300, dois POSTs de 100
// passam os dois, porque o segundo ainda encontra 200 disponiveis.
//
// Quem NAO usa chave: o retorno final do fechamento (D6). Ele nasce dentro da transacao ja
// serializada pela trava da linha do caixa e pela guarda `status = 'aberto'` do UPDATE (B1), e o
// valor e a sobra INTEIRA apurada no servidor — repetir o ato encontra saldo zero e nao cria nada.
const idempotenciaChaveSchema = uuidSchema;

// M2 — sangria (durante o turno) e retorno (no fechamento) sao a MESMA entidade (R4): transferencia
// caixa -> cofre. O servidor resolve a conta do cofre, a ordem e (opcional, D5) consome o lacre.
export const transferenciaCofrePayloadSchema = z.object({
  tipo: z.enum(["sangria", "retorno"]),
  valor: z.coerce.number().positive(),
  lacre: z.string().trim().min(1).optional().nullable(),
  observacao: z.string().trim().max(500).optional().nullable(),
  idempotenciaChave: idempotenciaChaveSchema
});

// D4 — a Tesouraria/Gestao PROGRAMA a entrega ligada ao caixa aberto. Nasce 'agendada', que
// `transferenciaContaComoSaida` NAO conta: programar nao movimenta dinheiro nenhum. Sem lacre aqui
// de proposito — o lacre e do movimento fisico (D5), e o fisico so acontece quando o operador
// executa. Reusa a mesma entidade transferencia caixa -> cofre; nao existe tabela paralela.
export const programarSolicitacaoCofrePayloadSchema = z.object({
  tipo: z.enum(["sangria", "retorno"]),
  valor: z.coerce.number().positive(),
  observacao: z.string().trim().max(500).optional().nullable(),
  idempotenciaChave: idempotenciaChaveSchema
});

// D4/D10 — o operador EXECUTA a solicitacao programada, e executa EXATAMENTE o que foi programado.
// O valor e a observacao NAO viajam neste payload: quem os definiu foi a retaguarda, e a execucao
// nao os reescreve. Se o operador tem mais do que o programado, o excedente vira um movimento
// avulso proprio (chave e lacre novos); se tem menos, a solicitacao simplesmente nao e executada.
//
// Tambem NAO ha `idempotenciaChave` aqui, e a ausencia e deliberada. A chave e da CRIACAO: ela
// ancora a programacao e nunca pode ser sobrescrita. Gravar uma chave nova na execucao apagava a
// ancora original — um retry da programacao deixava de encontrar a linha e criava outra
// solicitacao. A execucao e idempotente pelo `solicitacaoId` mais a transicao atomica
// `status = 'agendada'`, que so um chamador vence.
//
// Sobra o que e proprio do ato FISICO: o lacre do envelope (opcional, R-026).
export const executarSolicitacaoCofrePayloadSchema = z.object({
  lacre: z.string().trim().min(1).optional().nullable()
});

export const solicitacaoCofreParamsSchema = z.object({
  caixaId: uuidSchema,
  solicitacaoId: uuidSchema
});

// D4: o minimo para a retaguarda escolher para QUAL caixa aberto vai programar a entrega.
export const caixaAbertoResumoSchema = z.object({
  id: uuidSchema,
  pdvNome: z.string(),
  usuarioCaixaNome: z.string().nullable(),
  dataMovimento: z.string(),
  dataHoraAbertura: z.string().nullable()
});

// Uma solicitacao programada, como a tela do operador a enxerga. `valor` e o valor PROGRAMADO e
// imutavel: e exatamente o que a execucao vai movimentar.
export const solicitacaoCofreSchema = z.object({
  id: uuidSchema,
  tipo: z.enum(["sangria", "retorno"]),
  valor: z.number(),
  observacao: z.string().nullable(),
  criadoPor: z.string().nullable(),
  criadoEm: z.string()
});

// D4/decisao 2: cancelamento de solicitacao ainda `agendada`. Motivo obrigatorio — cancelar uma
// ordem de dinheiro sem dizer por que nao e auditoria, e apagar rastro com outro nome. O banco
// tambem exige (transferencias_cancelamento_check), entao a regra nao depende so desta validacao.
export const cancelarSolicitacaoCofrePayloadSchema = z.object({
  motivo: z.string().trim().min(1, "Motivo obrigatorio").max(500)
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
  // R-121: a conta do PDV e a UNICA origem valida das saidas do operador. O front precisa dela para
  // travar o campo Conta; sem isso a tela so descobriria a regra pelo 400 do servidor.
  pdvContaId: uuidSchema.nullable(),
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
export type ProgramarSolicitacaoCofrePayload = z.infer<typeof programarSolicitacaoCofrePayloadSchema>;
export type ExecutarSolicitacaoCofrePayload = z.infer<typeof executarSolicitacaoCofrePayloadSchema>;
export type CancelarSolicitacaoCofrePayload = z.infer<typeof cancelarSolicitacaoCofrePayloadSchema>;
export type SolicitacaoCofreParams = z.infer<typeof solicitacaoCofreParamsSchema>;
export type SolicitacaoCofre = z.infer<typeof solicitacaoCofreSchema>;
export type CaixaAbertoResumo = z.infer<typeof caixaAbertoResumoSchema>;
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
