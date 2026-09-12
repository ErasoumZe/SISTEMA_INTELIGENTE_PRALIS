import { z } from "zod";
import { paginationQuerySchema } from "../api/index.js";
import { deCentavos } from "../dinheiro/index.js";
import { saldoCaixaCentavos, saldoProprioCentavos, type TotaisCaixaCentavos } from "./regras.js";

export * from "./regras.js";

const uuidSchema = z.string().uuid();
const dataSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "data deve ser YYYY-MM-DD");

export const caixaStatusQuerySchema = z.object({
  empresaId: uuidSchema
});

export const abrirCaixaPayloadSchema = z.object({
  empresaId: uuidSchema,
  pdvId: uuidSchema,
  usuarioCaixaId: z.string().min(1),
  // R-184: a abertura usa exclusivamente o relogio do servidor no instante do POST. O cliente
  // nao envia data/hora e, por isso, nao consegue retroagir ou antecipar o inicio do turno.
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

// R-187 — Transferencia de retorno avulsa/final do Caixa para o Cofre. O servidor resolve a conta,
// a ordem e, quando informado, consome o lacre opcional da R-026.
export const transferenciaCofrePayloadSchema = z.object({
  valor: z.coerce.number().positive(),
  lacre: z.string().trim().min(1).optional().nullable(),
  observacao: z.string().trim().max(500).optional().nullable(),
  idempotenciaChave: idempotenciaChaveSchema
});

// R-185: estas rotas nao criam ordens; apenas operam linhas que ja nasceram junto da transferencia inicial.
export const planejamentoRetornoSchema = z.object({
  id: uuidSchema,
  tipo: z.enum(["sangria", "retorno"]),
  valor: z.number(),
  lacre: z.string(),
  contaDestinoId: uuidSchema,
  contaDestinoNome: z.string(),
  observacao: z.string().nullable(),
  criadoEm: z.string()
});
export const planejamentoRetornoParamsSchema = z.object({ caixaId: uuidSchema, planejamentoId: uuidSchema });
export const planejamentoRetornoIdParamsSchema = z.object({ planejamentoId: uuidSchema });
export const cancelarPlanejamentoRetornoPayloadSchema = z.object({
  motivo: z.string().trim().min(1, "Motivo obrigatorio").max(500)
});
export const executarPlanejamentoRetornoPayloadSchema = z.object({});

// R-185/R-187 · o painel paralelo "Programar entrega ao cofre" e seus contratos antigos continuam
// removidos. O planejamento atual nasce atomicamente no modal generico e a execucao ocorre no Caixa.

// G1/R-171/R-187 — um retorno que JA SAIU do caixa e ainda nao foi conferido. Enquanto existir
// uma destas, o caixa nao fecha pelo caminho comum: o dinheiro esta na rua e a divergencia futura
// precisa de um turno aberto para ter dono.
//
// O planejamento `agendada` tambem trava o fechamento, mas e exposto em `planejamentosPendentes`.
export const entregaCofrePendenteSchema = z.object({
  id: uuidSchema,
  tipo: z.enum(["sangria", "retorno"]),
  valor: z.number(),
  lacre: z.string().nullable(),
  contaDestinoNome: z.string(),
  criadoEm: z.string(),
  // R-183 · o que o cofre CONTOU na ultima tentativa de conferencia, quando ja houve uma. `null`
  // significa "ninguem contou ainda" — e e essa diferenca que a tela precisa mostrar: entrega sem
  // recusa trava o fechamento e nao tem saida; entrega ja recusada trava tambem, mas a saida existe
  // e esta no cofre. Sem o numero aqui, o operador leria "travado" nos dois casos e nao saberia a
  // quem cobrar.
  valorContado: z.number().nullable(),
  // A recusa que produziu esse numero. Serve de referencia estavel para a tela e para o suporte —
  // "a ultima" e uma leitura dependente de ordem, e este id nao e.
  recusaId: uuidSchema.nullable()
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
  resumo: resumoCaixaSchema.nullable(),
  // G1: viaja junto com o resumo de proposito — a tela precisa saber que o fechamento esta travado
  // ANTES do operador clicar, e no MESMO instante em que le o saldo. Campo obrigatorio, nunca
  // opcional: ausente teria de significar "nao ha", e um dia significaria "esqueci de preencher".
  entregasPendentes: entregaCofrePendenteSchema.array(),
  planejamentosPendentes: planejamentoRetornoSchema.array()
});

export type CaixaStatusQuery = z.infer<typeof caixaStatusQuerySchema>;
export type AbrirCaixaPayload = z.infer<typeof abrirCaixaPayloadSchema>;
export type CaixaParams = z.infer<typeof caixaParamsSchema>;
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
export type PlanejamentoRetorno = z.infer<typeof planejamentoRetornoSchema>;
export type PlanejamentoRetornoParams = z.infer<typeof planejamentoRetornoParamsSchema>;
export type PlanejamentoRetornoIdParams = z.infer<typeof planejamentoRetornoIdParamsSchema>;
export type CancelarPlanejamentoRetornoPayload = z.infer<typeof cancelarPlanejamentoRetornoPayloadSchema>;
export type EntregaCofrePendente = z.infer<typeof entregaCofrePendenteSchema>;
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
