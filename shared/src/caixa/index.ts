import { z } from "zod";
import { paginationQuerySchema } from "../api/index.js";
import { deCentavos, paraCentavos } from "../dinheiro/index.js";
import {
  saldoFisicoCaixaCentavos,
  saldoProprioCentavos,
  type TotaisCaixaCentavos,
  type TotaisFormaPagamentoCentavos
} from "./regras.js";

export * from "./regras.js";

const uuidSchema = z.string().uuid();
const dataSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "data deve ser YYYY-MM-DD");

export const caixaStatusQuerySchema = z.object({
  empresaId: uuidSchema
});

export const abrirCaixaPayloadSchema = z
  .object({
    empresaId: uuidSchema,
    pdvId: uuidSchema,
    usuarioCaixaId: z.string().min(1),
    // R-184: a abertura usa exclusivamente o relogio do servidor no instante do POST. O cliente
    // nao envia data/hora e, por isso, nao consegue retroagir ou antecipar o inicio do turno.
    // Turno da abertura: se ausente, o servidor usa o turno padrao do colaborador.
    turnoId: uuidSchema.optional().nullable(),
    // R-039: o equipamento é escolhido na abertura e é a referência imutável do relatório final.
    // Sem esse vínculo, seria possível fechar o turno com a foto de outra maquininha.
    maquininhaId: uuidSchema,
    // R-040: o lacre da IDA. Informa-lo E o ato de confirmar o recebimento da transferencia pendente
    // — o caixa vence a disputa (R-030), o dinheiro entra aqui e o lacre e rompido, tudo na mesma
    // transacao. Opcional porque a R-033 permite abrir zerado e receber o fundo depois.
    lacreAbertura: z.string().trim().min(1, "Lacre de abertura obrigatorio"),
    // R-207: nomes livres declarados na folha; a identidade autenticada permanece nos IDs do ato.
    caixaResponsavelNome: z.string().trim().min(1, "Informe o caixa responsavel").max(160),
    supervisorResponsavelNome: z.string().trim().min(1, "Informe o supervisor responsavel").max(160),
    // R-205: a contagem física só é enviada quando o Caixa apontar divergência. Sem os campos,
    // o servidor confirma exatamente a composição declarada pela Tesouraria.
    valorEspecieContado: z.coerce.number().nonnegative().optional(),
    valorMoedasContado: z.coerce.number().nonnegative().optional(),
    observacaoDivergencia: z.string().trim().max(500).optional().nullable(),
    observacao: z.string().optional().nullable()
  })
  .superRefine((dados, ctx) => {
    const temLacre = Boolean(dados.lacreAbertura);
    const informouContagem = dados.valorEspecieContado !== undefined || dados.valorMoedasContado !== undefined;
    if (
      temLacre &&
      informouContagem &&
      (dados.valorEspecieContado === undefined || dados.valorMoedasContado === undefined)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["valorEspecieContado"],
        message: "Informe especie e moedas juntas quando houver divergencia"
      });
    }
    if (!temLacre && informouContagem) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lacreAbertura"],
        message: "Contagem so existe com malote identificado por lacre"
      });
    }
  });

export const caixaParamsSchema = z.object({
  caixaId: uuidSchema
});
export const iniciarFechamentoCaixaPayloadSchema = z.object({});

// R-224: o operador pode RECUAR o inicio das vendas do caixa (ex.: abriu no sistema 13:18, mas ja vendia desde
// 13:00). O servidor limita a janela (60 min, mesmo dia, depois do caixa anterior do PDV) e grava o log; a
// abertura oficial (`abertoEm`) nunca muda.
export const ajustarInicioVendasCaixaPayloadSchema = z.object({
  inicio: z.string().datetime({ offset: true }),
  motivo: z.string().trim().min(3, "Informe o motivo").max(500)
});

export const motivoIndisponibilidadeCaixaSchema = z.enum([
  "falta_energia",
  "oscilacao_eletrica",
  "internet_caiu",
  "cabo_desconectado",
  "computador_travou",
  "limpeza_manutencao",
  "atualizacao_sistema",
  "outro"
]);

export const registrarIndisponibilidadeCaixaPayloadSchema = z
  .object({
    motivos: z.array(motivoIndisponibilidadeCaixaSchema).min(1).max(8),
    motivoOutro: z.string().trim().max(500).optional().nullable()
  })
  .superRefine((dados, ctx) => {
    const outro = dados.motivos.includes("outro");
    if (outro && !dados.motivoOutro) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["motivoOutro"], message: "Descreva o outro motivo" });
    }
    if (!outro && dados.motivoOutro) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["motivoOutro"],
        message: "Detalhe permitido somente para Outro"
      });
    }
  });

// Consulta operacional do turno atual. O cliente jamais escolhe empresa, PDV, caixa ou periodo:
// a rota deriva tudo do caixa identificado no path e aceita somente os refinamentos de leitura.
// `dataHora*` carregam fuso porque hora sem data/fuso nao prova em que lado da meia-noite ocorreu.
export const vendasDoCaixaQuerySchema = z
  .object({
    produto: z.string().trim().min(1).max(200).optional(),
    formaPagamentoId: uuidSchema.optional(),
    dataHoraInicio: z.string().datetime({ offset: true }).optional(),
    dataHoraFim: z.string().datetime({ offset: true }).optional()
  })
  .merge(paginationQuerySchema);

// D6: o retorno final e o fechamento sao UM ato atomico. O cliente nao manda o VALOR do retorno —
// o servidor usa a sobra que ele mesmo apurou sob trava, para que nao exista janela entre o que a
// tela viu e o que o banco tem. O lacre do retorno e por movimento (D5) e continua opcional
// (R-026). O lacre do fechamento (R-200) e outro objeto fisico e sempre obrigatorio, inclusive
// sem retorno financeiro.
export const fecharCaixaPayloadSchema = z.object({
  observacao: z.string().trim().max(500).optional().nullable(),
  lacreFechamento: z.string().trim().min(1, "Lacre de fechamento obrigatorio"),
  caixaResponsavelNome: z.string().trim().min(1, "Informe o caixa responsavel").max(160),
  supervisorResponsavelNome: z.string().trim().min(1, "Informe o supervisor responsavel").max(160),
  valorEspecieFechamento: z.coerce.number().nonnegative(),
  valorMoedasFechamento: z.coerce.number().nonnegative()
});

// Leitura assistida de UM relatório de maquininha anexado no fechamento. A sugestão nunca entra
// no saldo físico do caixa: ela é evidência editável para a conferência de recebíveis/cartões.
// Correcao manual do que a IA leu: os numeros lidos ficam travados na tela; para mudar algum, o operador
// toca em "Corrigir manualmente" e justifica. Fica gravado quais campos mudaram e por que.
export const correcaoManualLeituraSchema = z
  .object({
    justificativa: z.string().trim().min(5, "Explique a correcao").max(300),
    campos: z.array(z.string().trim().max(40)).min(1).max(20)
  })
  .nullable()
  .default(null);
export type CorrecaoManualLeitura = z.infer<typeof correcaoManualLeituraSchema>;

const valorRelatorioMaquininhaSchema = z.coerce.number().nonnegative().nullable();
const detalheRelatorioMaquininhaSchema = z.object({
  nome: z.string().trim().min(1).max(160),
  valor: z.coerce.number().nonnegative()
});
export const detalhesRelatorioMaquininhaSchema = z.object({
  credito: z.array(detalheRelatorioMaquininhaSchema).max(80).default([]),
  debito: z.array(detalheRelatorioMaquininhaSchema).max(80).default([]),
  pix: z.array(detalheRelatorioMaquininhaSchema).max(80).default([]),
  voucher: z.array(detalheRelatorioMaquininhaSchema).max(80).default([])
});
export const relatorioMaquininhaIaSchema = z.object({
  documentoLegivel: z.boolean(),
  numeroMaquininha: z.string().trim().max(160).nullable(),
  dataEmissao: z.string().trim().max(32).nullable(),
  acumulador: valorRelatorioMaquininhaSchema,
  credito: valorRelatorioMaquininhaSchema,
  debito: valorRelatorioMaquininhaSchema,
  pix: valorRelatorioMaquininhaSchema,
  voucher: valorRelatorioMaquininhaSchema,
  detalhes: detalhesRelatorioMaquininhaSchema.default({ credito: [], debito: [], pix: [], voucher: [] }),
  camposDuvidosos: z.array(z.string().trim().max(100)).max(30).default([]),
  observacoes: z.array(z.string().trim().max(300)).max(20).default([]),
  correcaoManual: correcaoManualLeituraSchema
});
export type RelatorioMaquininhaIa = z.infer<typeof relatorioMaquininhaIaSchema>;

// O fechamento reproduz os dois relatórios da maquininha: leitura da manhã e leitura da tarde.
// A maquininha continua sendo a escolhida na abertura; a foto apenas sugere valores revisáveis.
export const salvarRelatorioMaquininhaFechamentoSchema = z.object({
  anexoId: uuidSchema,
  leituraAcumulada: relatorioMaquininhaIaSchema
});
export type RelatorioMaquininhaFechamento = z.infer<typeof salvarRelatorioMaquininhaFechamentoSchema>;

const valorRelatorioCreareSchema = z.coerce.number().nonnegative().nullable();
export const relatorioVendasCreareSchema = z.object({
  documentoLegivel: z.boolean(),
  totalBruto: valorRelatorioCreareSchema,
  dinheiro: valorRelatorioCreareSchema,
  credito: valorRelatorioCreareSchema,
  debito: valorRelatorioCreareSchema,
  pix: valorRelatorioCreareSchema,
  voucher: valorRelatorioCreareSchema,
  despesasExcetoSangria: valorRelatorioCreareSchema,
  resultadoFinal: valorRelatorioCreareSchema,
  camposDuvidosos: z.array(z.string().trim().max(120)).max(30).default([]),
  observacoes: z.array(z.string().trim().max(300)).max(20).default([])
});
export type RelatorioVendasCreare = z.infer<typeof relatorioVendasCreareSchema>;
export const gerarRelatorioVendasFechamentoSchema = z.object({
  anexoId: uuidSchema,
  leituraCreare: relatorioVendasCreareSchema
});
export type GerarRelatorioVendasFechamento = z.infer<typeof gerarRelatorioVendasFechamentoSchema>;

// Status gravados pelo sistema hoje: "aberto" (abertura) e "fechado" (fechamento). "ajustado" e
// aceito pela constraint do banco e existe no seed, mas NENHUM fluxo o escreve — o acerto de saldo
// cria despesa/debito/ajuste e mantem o caixa aberto. Quem quer "houve acerto" usa temAjuste.
export const statusCaixaSchema = z.enum(["aberto", "em_fechamento", "fechado", "ajustado"]);

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

// Uma linha da listagem. Fechados usam o snapshot de fechamentos_caixa; abertos trazem o
// retrato operacional calculado no servidor, sem persistir nenhum fechamento antecipadamente.
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
  fechamentoIniciadoEm: z.string().nullable(),
  fechadoPor: z.string().nullable(),
  fechadoPorNome: z.string().nullable(),
  lacreAbertura: z.string().nullable(),
  lacreFechamento: z.string().nullable(),
  caixaResponsavelNomeAbertura: z.string().nullable(),
  supervisorResponsavelNomeAbertura: z.string().nullable(),
  caixaResponsavelNomeFechamento: z.string().nullable(),
  supervisorResponsavelNomeFechamento: z.string().nullable(),
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

// Venda cancelada nao compoe nenhum total do Caixa. Ela viaja separada para que o operador e a
// gerencia consigam auditar a venda que foi removida do saldo, inclusive seus produtos, sem dar a
// impressao de que aquele valor ainda esta disponivel no malote.
export const vendaCanceladaCaixaSchema = z.object({
  id: uuidSchema,
  identificadorExterno: z.string().nullable(),
  descricao: z.string(),
  data: z.string().nullable(),
  dataHora: z.string().nullable(),
  valor: z.number(),
  canceladoPor: z.string().nullable(),
  justificativaCancelamento: z.string().nullable(),
  motivoCancelamento: z.string().nullable(),
  pagamentos: z.array(
    z.object({
      id: uuidSchema,
      formaPagamento: z.string(),
      valor: z.number()
    })
  ),
  produtos: z.array(
    z.object({
      id: uuidSchema,
      descricao: z.string(),
      quantidade: z.number(),
      valorUnitario: z.number(),
      valorTotal: z.number(),
      cancelado: z.boolean()
    })
  )
});

export const detalheCaixaResponseSchema = z.object({
  lancamentos: z.array(categoriaLancamentosCaixaSchema),
  vendasCanceladas: z.array(vendaCanceladaCaixaSchema),
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
  saldo: z.number(),
  // Subtotais informativos das vendas do turno. Ausente apenas em consumidores legados que nao
  // calcularam a divisao; a API do caixa aberto sempre preenche.
  porFormaPagamento: z
    .array(
      z.object({
        formaPagamentoId: z.string().nullable(),
        formaPagamento: z.string(),
        total: z.number(),
        quantidade: z.number().int().nonnegative()
      })
    )
    .optional()
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
export const transferenciaCofrePayloadSchema = z
  .object({
    valor: z.coerce.number().positive(),
    valorEspecie: z.coerce.number().nonnegative(),
    valorMoedas: z.coerce.number().nonnegative(),
    // R-208: o Caixa nao digita um lacre novo. Ele escolhe uma bolsa que a Tesouraria mandou
    // aberta dentro do malote recebido; o servidor confere que ela pertence a este caixa.
    lacreId: uuidSchema,
    // O modal operacional exige o nome. Opcional no contrato durante a transição para manter os
    // registros e integrações históricas compatíveis; quando informado, nunca aceita texto vazio.
    responsavelNome: z
      .string()
      .trim()
      .min(1, "Responsavel pela transferencia de retorno / sangria obrigatorio")
      .max(120)
      .optional(),
    observacao: z.string().trim().max(500).optional().nullable(),
    idempotenciaChave: idempotenciaChaveSchema
  })
  .superRefine((dados, ctx) => {
    if (paraCentavos(dados.valorEspecie) + paraCentavos(dados.valorMoedas) !== paraCentavos(dados.valor)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["valor"],
        message: "Especie mais moedas deve ser igual ao valor da transferencia"
      });
    }
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
  valorEspecie: z.number().nullable(),
  valorMoedas: z.number().nullable(),
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
  fechamentoIniciadoEm: z.string().nullable(),
  fechadoEm: z.string().nullable(),
  tokenEdicao: z.string().nullable(),
  turnoId: z.string().nullable(),
  turnoNome: z.string().nullable(),
  maquininhaId: uuidSchema.nullable(),
  maquininhaApelido: z.string().nullable(),
  maquininhaNumeroSerie: z.string().nullable(),
  // Retrato dos responsáveis informados no ato da abertura. Nulo apenas para caixas legados.
  caixaResponsavelNomeAbertura: z.string().nullable(),
  supervisorResponsavelNomeAbertura: z.string().nullable(),
  observacao: z.string().nullable(),
  status: z.string()
});

export const indisponibilidadeAbertaCaixaSchema = z.object({
  id: uuidSchema,
  motivos: z.array(motivoIndisponibilidadeCaixaSchema),
  motivoOutro: z.string().nullable(),
  iniciadoEm: z.string()
});

export const caixaStatusSchema = z.object({
  caixaAberto: caixaOperacionalSchema.nullable(),
  resumo: resumoCaixaSchema.nullable(),
  // Presente na consulta do status antes da abertura. A tela usa estes ids para exibir o posto
  // configurado, mas a API continua validando-os no POST de abertura.
  vinculoOperador: z
    .object({
      pdvId: uuidSchema,
      turnoId: uuidSchema
    })
    .nullable()
    .optional(),
  lacreFechamentoReservado: z.string().nullable(),
  indisponibilidadeAberta: indisponibilidadeAbertaCaixaSchema.nullable(),
  // G1: viaja junto com o resumo de proposito — a tela precisa saber que o fechamento esta travado
  // ANTES do operador clicar, e no MESMO instante em que le o saldo. Campo obrigatorio, nunca
  // opcional: ausente teria de significar "nao ha", e um dia significaria "esqueci de preencher".
  entregasPendentes: entregaCofrePendenteSchema.array(),
  planejamentosPendentes: planejamentoRetornoSchema.array()
});

export type CaixaStatusQuery = z.infer<typeof caixaStatusQuerySchema>;
export type AbrirCaixaPayload = z.infer<typeof abrirCaixaPayloadSchema>;
export type CaixaParams = z.infer<typeof caixaParamsSchema>;
export type IniciarFechamentoCaixaPayload = z.infer<typeof iniciarFechamentoCaixaPayloadSchema>;
export type AjustarInicioVendasCaixaPayload = z.infer<typeof ajustarInicioVendasCaixaPayloadSchema>;
export type RegistrarIndisponibilidadeCaixaPayload = z.infer<typeof registrarIndisponibilidadeCaixaPayloadSchema>;
export type VendasDoCaixaQuery = z.infer<typeof vendasDoCaixaQuerySchema>;
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
export type VendaCanceladaCaixa = z.infer<typeof vendaCanceladaCaixaSchema>;
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
  const saldoFisicoCentavos = saldoFisicoCaixaCentavos(totais);
  const resumo: ResumoCaixa = {
    totalEntradas: deCentavos(totais.entradas),
    totalTransferencias: deCentavos(totais.transferencias),
    totalTransferenciasEntrada: deCentavos(totais.transferenciasEntrada),
    totalTransferenciasSaida: deCentavos(totais.transferenciasSaida),
    totalDespesas: deCentavos(totais.despesas),
    totalRetiradas: deCentavos(totais.retiradas),
    totalMercadorias: deCentavos(totais.mercadorias),
    dividaCofre: deCentavos(dividaCofreCentavos),
    saldoProprio: deCentavos(saldoProprioCentavos(totais, dividaCofreCentavos)),
    propostaRetorno: deCentavos(Math.max(0, saldoFisicoCentavos)),
    saldo: deCentavos(saldoFisicoCentavos)
  };
  if (totais.porFormaPagamento) {
    resumo.porFormaPagamento = totais.porFormaPagamento.map((item: TotaisFormaPagamentoCentavos) => ({
      formaPagamentoId: item.formaPagamentoId,
      formaPagamento: item.formaPagamento,
      total: deCentavos(item.total),
      quantidade: item.quantidade
    }));
  }
  return resumo;
}
export type CaixaStatus = z.infer<typeof caixaStatusSchema>;
