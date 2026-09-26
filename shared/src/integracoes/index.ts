import { z } from "zod";
import { paginationQuerySchema } from "../api/index.js";
import type { RoteamentoDaForma } from "../formas-pagamento/index.js";

const uuidSchema = z.string().uuid();
const dinheiroSchema = z.coerce.number().min(0);
const textoObrigatorioSchema = z.string().trim().min(1);

// Dinheiro de item de venda: mantem a regra >= 0 (boa regra — o agente normaliza na origem) e cita o
// CAMPO na mensagem, para o erro ser acionavel em vez de generico.
//
// O valor recebido NAO entra na mensagem. Ele entrava (`recebido: ${issue.input}`) e ia parar no
// corpo da resposta HTTP do integrador, junto com o `caminho` do campo — refletindo de volta um dado
// financeiro cru que ninguem precisa ver ali. O caminho do zod ja diz QUAL item e QUAL campo falhou;
// quem precisa do valor tem o payload inteiro gravado no historico, que e interno.
const dinheiroItemSchema = (campo: string) =>
  z.coerce.number().min(0, { error: () => `${campo} do item nao pode ser negativo` });

export const tiposIntegracao = ["vendas"] as const;
// "colaborador" e um tipo de vinculo (de-para / pendencia "sem conversao") mas NAO um campo de config:
// o vendedor nunca e criado nem casado automaticamente — so resolvido pelo dicionario ou vira pendencia.
export const tiposRegistroIntegracao = [
  "venda",
  "pdv",
  "cliente",
  "produto",
  "forma_pagamento",
  "colaborador"
] as const;
export const camposVinculoIntegracao = ["pdv", "cliente", "produto", "forma_pagamento"] as const;

export const integracaoQuerySchema = z
  .object({
    empresaId: uuidSchema.optional()
  })
  .merge(paginationQuerySchema);

export const integracaoCodigoParamsSchema = z.object({
  codigo: textoObrigatorioSchema
});

export const integracaoChaveParamsSchema = z.object({
  id: uuidSchema
});

export const criarIntegracaoChavePayloadSchema = z.object({
  empresaId: uuidSchema,
  tipo: z.enum(tiposIntegracao)
});

export const atualizarCampoIntegracaoPayloadSchema = z.object({
  empresaId: uuidSchema,
  tipo: z.enum(tiposIntegracao),
  campo: z.enum(camposVinculoIntegracao),
  criarAutomaticamente: z.boolean(),
  vincularAutomaticamente: z.boolean()
});

export const salvarVinculoIntegracaoPayloadSchema = z.object({
  empresaId: uuidSchema,
  tipo: z.enum(tiposIntegracao),
  tipoRegistro: z.enum(tiposRegistroIntegracao),
  identificadorExterno: textoObrigatorioSchema,
  descricaoExterna: z.string().optional().nullable(),
  registroSistemaId: uuidSchema
});

export const dadosIntegracaoPayloadSchema = z.record(z.string(), z.unknown()).default({});

// Vendedor/atendente do PDV. Opcional (agente antigo nao envia; pode nao haver operador na venda).
// `identificador` e a chave do de-para (o usuario/operador do CREARE); `nome` e o texto cru do posto de
// caixa (ex.: "VND CAIXA PDV - 2M"), guardado para auditoria e para o gerente reconhecer na pendencia.
export const vendedorIntegracaoPayloadSchema = z.object({
  identificador: z.string().trim().optional().nullable(),
  nome: z.string().trim().optional().nullable()
});

// Auditoria que o CREARE grava ao cancelar a venda. A senha nunca sai da automacao: ela apenas
// autoriza o ato la; o Pralis recebe o usuario identificado, o motivo e a justificativa digitada.
export const cancelamentoIntegracaoPayloadSchema = z.object({
  usuarioId: z.string().trim().optional().nullable(),
  usuarioNome: z.string().trim().optional().nullable(),
  justificativa: z.string().trim().optional().nullable(),
  motivo: z.string().trim().optional().nullable()
});

export const vendaIntegracaoPayloadSchema = z.object({
  idVenda: textoObrigatorioSchema,
  idCaixa: textoObrigatorioSchema,
  nomeCaixa: textoObrigatorioSchema,
  idCliente: z.string().trim().optional().nullable(),
  nomeCliente: z.string().trim().optional().nullable(),
  documentoCliente: z.string().trim().optional().nullable(),
  vendedor: vendedorIntegracaoPayloadSchema.optional().nullable(),
  dataHoraVenda: z.coerce.date(),
  valorOriginal: dinheiroSchema,
  desconto: dinheiroSchema.default(0),
  acrescimo: dinheiroSchema.default(0),
  valorTotal: dinheiroSchema,
  statusVenda: textoObrigatorioSchema,
  numeroNotaFiscal: z.string().trim().optional().nullable(),
  cancelamento: cancelamentoIntegracaoPayloadSchema.optional().nullable()
});

export const itemVendaIntegracaoPayloadSchema = z.object({
  idRegistro: textoObrigatorioSchema,
  idProduto: textoObrigatorioSchema,
  descricaoProduto: textoObrigatorioSchema,
  dataHoraItem: z.coerce.date(),
  quantidade: z.coerce.number().min(0),
  valorUnitario: dinheiroItemSchema("valorUnitario"),
  desconto: dinheiroItemSchema("desconto").default(0),
  acrescimo: dinheiroItemSchema("acrescimo").default(0),
  total: dinheiroItemSchema("total"),
  itemCancelado: z.coerce.boolean().default(false)
});

export const pagamentoVendaIntegracaoPayloadSchema = z.object({
  idVenda: textoObrigatorioSchema,
  idFormaPagamento: textoObrigatorioSchema,
  descricaoFormaPagamento: textoObrigatorioSchema,
  valor: dinheiroSchema
});

export const vendaIntegracaoAgregadaSchema = z.object({
  DadosIntegracao: dadosIntegracaoPayloadSchema,
  Venda: vendaIntegracaoPayloadSchema,
  ItensVenda: z.array(itemVendaIntegracaoPayloadSchema).default([]),
  PagamentosVenda: z.array(pagamentoVendaIntegracaoPayloadSchema).default([])
});

export const integracaoChaveDtoSchema = z.object({
  id: z.string(),
  empresaId: z.string(),
  tipo: z.enum(tiposIntegracao),
  codigo: z.string(),
  ativa: z.boolean(),
  criadoEm: z.string().or(z.date()),
  inativadoEm: z.string().or(z.date()).nullable().optional()
});

export const integracaoHistoricoDtoSchema = z.object({
  dia: z.string(),
  tipo: z.enum(tiposIntegracao),
  recebidos: z.number(),
  novos: z.number(),
  atualizados: z.number(),
  semNovidade: z.number(),
  erros: z.number()
});

export const integracaoCampoConfigDtoSchema = z.object({
  empresaId: z.string(),
  tipo: z.enum(tiposIntegracao),
  campo: z.enum(camposVinculoIntegracao),
  criarAutomaticamente: z.boolean(),
  vincularAutomaticamente: z.boolean()
});

export const integracaoVinculoDtoSchema = z.object({
  id: z.string(),
  empresaId: z.string(),
  tipo: z.enum(tiposIntegracao),
  tipoRegistro: z.enum(tiposRegistroIntegracao),
  identificadorExterno: z.string(),
  descricaoExterna: z.string().nullable(),
  registroSistemaId: z.string().nullable(),
  pendente: z.boolean()
});

export const integracaoIngestaoResultadoSchema = z.object({
  status: z.enum(["criado", "atualizado", "sem_novidade"]),
  vendaId: z.string().nullable(),
  identificadorExterno: z.string()
});

// --- Conciliacao diaria sistema x CREARE -------------------------------------------------------
// O agente manda o que o CREARE tem (por PDV, so venda fechada) e a API compara com o que entrou
// no sistema. Nao persiste nada: o e-mail de divergencia e o registro.
export const conciliacaoPdvPayloadSchema = z.object({
  // Mesmo identificador externo do PDV usado na ingestao (Venda.idCaixa) — resolvido pelo
  // dicionario de vinculos ja existente.
  pdvIdentificador: z.string().min(1),
  quantidadeVendas: z.number().int().min(0),
  valorTotal: z.number().min(0),
  // IDs das vendas fechadas do dia nesse PDV, no formato que o sistema guarda (CREARE:<id>). Opcional
  // (agente antigo nao envia): quando presente, a API aponta quais faltam. default [] para compat.
  idsVendas: z.array(z.string()).default([])
});

export const conciliacaoPayloadSchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "data deve ser yyyy-MM-dd"),
  porPdv: z.array(conciliacaoPdvPayloadSchema)
});

// Tolerancia de 1 centavo: abaixo disso e ruido de arredondamento, nao divergencia.
export const TOLERANCIA_CONCILIACAO_CENTAVOS = 1;

export const conciliacaoPdvResultadoSchema = z.object({
  pdvIdentificador: z.string(),
  pdvId: z.string().nullable(),
  pdvNome: z.string().nullable(),
  sistema: z.object({ quantidadeVendas: z.number().int(), valorTotal: z.number() }),
  creare: z.object({ quantidadeVendas: z.number().int(), valorTotal: z.number() }),
  diferenca: z.number(),
  ok: z.boolean(),
  // PDV que o CREARE mandou mas que nao tem vinculo resolvido no sistema: nao da para comparar,
  // entao nao e "ok". Nunca criamos vinculo aqui — isso e regra da ingestao.
  pdvNaoVinculado: z.boolean(),
  // IDs presentes no CREARE (idsVendas enviados) e ausentes no sistema: transforma o alerta de
  // divergencia em diagnostico pronto (basta reprocessar esses IDs). Vazio quando nada falta ou
  // quando o agente nao enviou a lista.
  idsFaltantes: z.array(z.string())
});

export const conciliacaoResultadoSchema = z.object({
  data: z.string(),
  ok: z.boolean(),
  porPdv: z.array(conciliacaoPdvResultadoSchema),
  alertasEnviados: z.number().int().min(0)
});

export type ConciliacaoPayload = z.infer<typeof conciliacaoPayloadSchema>;
export type ConciliacaoPdvPayload = z.infer<typeof conciliacaoPdvPayloadSchema>;
export type ConciliacaoPdvResultado = z.infer<typeof conciliacaoPdvResultadoSchema>;
export type ConciliacaoResultado = z.infer<typeof conciliacaoResultadoSchema>;

export type TipoIntegracao = z.infer<typeof criarIntegracaoChavePayloadSchema>["tipo"];
export type TipoRegistroIntegracao = (typeof tiposRegistroIntegracao)[number];
export type CampoVinculoIntegracao = (typeof camposVinculoIntegracao)[number];
export type IntegracaoQuery = z.infer<typeof integracaoQuerySchema>;
export type CriarIntegracaoChavePayload = z.infer<typeof criarIntegracaoChavePayloadSchema>;
export type AtualizarCampoIntegracaoPayload = z.infer<typeof atualizarCampoIntegracaoPayloadSchema>;
export type SalvarVinculoIntegracaoPayload = z.infer<typeof salvarVinculoIntegracaoPayloadSchema>;
export type DadosIntegracaoPayload = z.infer<typeof dadosIntegracaoPayloadSchema>;
export type VendedorIntegracaoPayload = z.infer<typeof vendedorIntegracaoPayloadSchema>;
export type VendaIntegracaoPayload = z.infer<typeof vendaIntegracaoPayloadSchema>;
export type ItemVendaIntegracaoPayload = z.infer<typeof itemVendaIntegracaoPayloadSchema>;
export type PagamentoVendaIntegracaoPayload = z.infer<typeof pagamentoVendaIntegracaoPayloadSchema>;
export type VendaIntegracaoAgregadaPayload = z.infer<typeof vendaIntegracaoAgregadaSchema>;
export type IntegracaoChaveDto = z.infer<typeof integracaoChaveDtoSchema>;
export type IntegracaoHistoricoDto = z.infer<typeof integracaoHistoricoDtoSchema>;
export type IntegracaoCampoConfigDto = z.infer<typeof integracaoCampoConfigDtoSchema>;
export type IntegracaoVinculoDto = z.infer<typeof integracaoVinculoDtoSchema>;
export type IntegracaoIngestaoResultado = z.infer<typeof integracaoIngestaoResultadoSchema>;

// =====================================================================================
// R-167 / R-168 / R-169 / R-173 — roteamento financeiro da venda integrada (#152)
//
// Tudo aqui e PURO de proposito: a decisao de para onde vai o dinheiro tem de ser testavel sem
// banco, sem HTTP e sem CREARE. O repositorio so aplica o que estas funcoes decidem.
// =====================================================================================

// Os tres estados de um pagamento, iguais ao `vendas_pagamentos_roteamento_status_check` da 0033.
export const statusRoteamento = ["nao_aplicavel", "pendente", "roteado"] as const;
export type StatusRoteamento = (typeof statusRoteamento)[number];

// Por que a venda/pagamento ficou pendente. Vai para a tela de pendencias e para o historico; NUNCA
// para o corpo da resposta do agente, que so precisa saber que a venda foi aceita.
export const motivosPendenciaRoteamento = [
  "forma_sem_cadastro",
  "forma_sem_roteamento",
  "pdv_nao_resolvido",
  "venda_sem_data",
  "soma_nao_fecha"
] as const;
export type MotivoPendenciaRoteamento = (typeof motivosPendenciaRoteamento)[number];

export type RoteamentoDoPagamento =
  | {
      status: "roteado";
      contaRecebivelId: string;
      contaFinalId: string;
      adquirente: string | null;
      // `null` = recebivel em aberto: existe no financeiro e NAO entra no saldo gastavel (R-169).
      disponivelEm: Date | null;
      motivo: null;
    }
  | {
      status: "pendente";
      contaRecebivelId: null;
      contaFinalId: null;
      adquirente: string | null;
      disponivelEm: null;
      motivo: MotivoPendenciaRoteamento;
    };

function pendente(motivo: MotivoPendenciaRoteamento, adquirente: string | null = null): RoteamentoDoPagamento {
  return { status: "pendente", contaRecebivelId: null, contaFinalId: null, adquirente, disponivelEm: null, motivo };
}

/**
 * Decide o destino de UM pagamento da venda integrada.
 *
 * Nao existe fallback. Se a forma nao tem cadastro, nao tem roteamento, ou pede a conta do PDV sem
 * que o PDV tenha sido resolvido, o pagamento nasce PENDENTE: a venda e preservada e nada vira
 * saldo (R-168). Cair em Dinheiro, Outro ou na conta do PDV "por omissao" e exatamente o que a
 * regra proibe.
 */
export function resolverRoteamentoDoPagamento(entrada: {
  roteamento: RoteamentoDaForma | null;
  contaDoPdvId: string | null;
  dataVenda: Date | null;
}): RoteamentoDoPagamento {
  const { roteamento, contaDoPdvId, dataVenda } = entrada;

  // Forma que o vinculo nao resolveu, ou que o CREARE acabou de criar sozinha.
  if (!roteamento) return pendente("forma_sem_cadastro");
  const adquirente = roteamento.adquirente;
  if (roteamento.disponibilidade === null) return pendente("forma_sem_roteamento", adquirente);

  if (roteamento.usaContaDoPdv) {
    // Dinheiro fisico. So e dinheiro do caixa se houver caixa: sem PDV/turno resolvido, o valor nao
    // tem onde cair e vira pendencia — nunca a conta "mais provavel".
    if (!contaDoPdvId) return pendente("pdv_nao_resolvido", adquirente);
    // Sem hora da venda nao da para dizer QUANDO ficou disponivel. Preferimos a pendencia a inventar
    // um instante — a data e o que decide em qual dia o dinheiro entrou.
    if (!dataVenda) return pendente("venda_sem_data", adquirente);
    return {
      status: "roteado",
      contaRecebivelId: contaDoPdvId,
      contaFinalId: contaDoPdvId,
      adquirente,
      disponivelEm: dataVenda,
      motivo: null
    };
  }

  // `por_evento`: os CHECKs da 0033 garantem as duas contas preenchidas aqui. O `??` existe so para
  // o TypeScript; se algum dia o banco deixasse passar nulo, a leitura correta e pendencia.
  if (!roteamento.contaRecebivelId || !roteamento.contaFinalId) return pendente("forma_sem_roteamento", adquirente);
  return {
    status: "roteado",
    contaRecebivelId: roteamento.contaRecebivelId,
    contaFinalId: roteamento.contaFinalId,
    adquirente,
    // Recebivel: aparece no financeiro e NAO vira saldo gastavel ate a liquidacao confirmar. A
    // liquidacao e vertical posterior (doc 32 §18 ponto 7); nesta issue nada confirma sozinho.
    disponivelEm: null,
    motivo: null
  };
}

/**
 * R-173: a soma dos pagamentos tem de bater com o liquido da venda, com tolerancia ZERO.
 *
 * Nao usa `TOLERANCIA_CONCILIACAO_CENTAVOS`: aquele 1 centavo e da conferencia de totais do dia por
 * PDV, outra pergunta. Reusa-lo aqui seria inventar tolerancia onde a R-170 escreveu R$ 0,00.
 */
export function somaDosPagamentosFecha(entrada: { liquidoCentavos: number; pagamentosCentavos: number[] }): {
  fecha: boolean;
  somaCentavos: number;
  diferencaCentavos: number;
} {
  const somaCentavos = entrada.pagamentosCentavos.reduce((total, valor) => total + valor, 0);
  const diferencaCentavos = somaCentavos - entrada.liquidoCentavos;
  return { fecha: diferencaCentavos === 0, somaCentavos, diferencaCentavos };
}

/**
 * O corte historico da R-166, derivado — sem coluna nova e sem data de corte.
 *
 * O marcador e o proprio `roteamento_status`: o codigo novo NUNCA grava `nao_aplicavel`, entao uma
 * venda com qualquer pagamento diferente de `nao_aplicavel` foi escrita pelo codigo com roteamento.
 * Venda anterior tem todos os pagamentos no DEFAULT `nao_aplicavel` e continua assim para sempre,
 * inclusive quando o CREARE a reenvia.
 *
 * A venda que esta sendo CRIADA agora e sempre aplicavel. A que ja existia so e aplicavel se ela
 * propria ja tinha roteamento — o reenvio preserva o que a venda era, nunca promove historico.
 *
 * Caso de borda, resolvido para o lado seguro: uma venda existente SEM nenhum pagamento gravado nao
 * tem como provar que nasceu do codigo novo, entao e tratada como historica. O custo e uma pendencia
 * a mais; o beneficio e nunca creditar dinheiro que o passado nao creditou.
 */
export function vendaAceitaRoteamento(entrada: { criando: boolean; statusExistentes: StatusRoteamento[] }): boolean {
  if (entrada.criando) return true;
  return entrada.statusExistentes.some((status) => status !== "nao_aplicavel");
}
