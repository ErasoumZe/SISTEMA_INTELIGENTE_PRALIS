import { z } from "zod";
import { paginationQuerySchema } from "../api/index.js";

const uuidSchema = z.string().uuid();
const dinheiroSchema = z.coerce.number().min(0);
const textoObrigatorioSchema = z.string().trim().min(1);

// Dinheiro de item de venda: mantem a regra >= 0 (boa regra — o agente normaliza na origem), mas cita
// o campo e o valor recebido na mensagem. Se um negativo voltar a escapar do CREARE, o historico de
// erro aponta exatamente o que chegou, em vez da mensagem generica do zod.
const dinheiroItemSchema = (campo: string) =>
  z.coerce
    .number()
    .min(0, { error: (issue) => `${campo} do item nao pode ser negativo (recebido: ${String(issue.input)})` });

export const tiposIntegracao = ["vendas"] as const;
export const tiposRegistroIntegracao = ["venda", "pdv", "cliente", "produto", "forma_pagamento"] as const;
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

export const vendaIntegracaoPayloadSchema = z.object({
  idVenda: textoObrigatorioSchema,
  idCaixa: textoObrigatorioSchema,
  nomeCaixa: textoObrigatorioSchema,
  idCliente: z.string().trim().optional().nullable(),
  nomeCliente: z.string().trim().optional().nullable(),
  documentoCliente: z.string().trim().optional().nullable(),
  dataHoraVenda: z.coerce.date(),
  valorOriginal: dinheiroSchema,
  desconto: dinheiroSchema.default(0),
  acrescimo: dinheiroSchema.default(0),
  valorTotal: dinheiroSchema,
  statusVenda: textoObrigatorioSchema,
  numeroNotaFiscal: z.string().trim().optional().nullable()
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
export type VendaIntegracaoPayload = z.infer<typeof vendaIntegracaoPayloadSchema>;
export type ItemVendaIntegracaoPayload = z.infer<typeof itemVendaIntegracaoPayloadSchema>;
export type PagamentoVendaIntegracaoPayload = z.infer<typeof pagamentoVendaIntegracaoPayloadSchema>;
export type VendaIntegracaoAgregadaPayload = z.infer<typeof vendaIntegracaoAgregadaSchema>;
export type IntegracaoChaveDto = z.infer<typeof integracaoChaveDtoSchema>;
export type IntegracaoHistoricoDto = z.infer<typeof integracaoHistoricoDtoSchema>;
export type IntegracaoCampoConfigDto = z.infer<typeof integracaoCampoConfigDtoSchema>;
export type IntegracaoVinculoDto = z.infer<typeof integracaoVinculoDtoSchema>;
export type IntegracaoIngestaoResultado = z.infer<typeof integracaoIngestaoResultadoSchema>;
