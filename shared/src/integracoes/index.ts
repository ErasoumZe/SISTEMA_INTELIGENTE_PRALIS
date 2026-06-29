import { z } from "zod";
import { paginationQuerySchema } from "../api/index.js";

const uuidSchema = z.string().uuid();
const dinheiroSchema = z.coerce.number().min(0);
const textoObrigatorioSchema = z.string().trim().min(1);

export const tiposIntegracao = ["vendas"] as const;
export const tiposRegistroIntegracao = ["venda", "pdv", "cliente", "produto", "forma_pagamento"] as const;
export const camposVinculoIntegracao = ["pdv", "cliente", "produto", "forma_pagamento"] as const;

export const integracaoQuerySchema = z.object({
  empresaId: uuidSchema.optional()
}).merge(paginationQuerySchema);

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
  valorUnitario: dinheiroSchema,
  desconto: dinheiroSchema.default(0),
  acrescimo: dinheiroSchema.default(0),
  total: dinheiroSchema,
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
