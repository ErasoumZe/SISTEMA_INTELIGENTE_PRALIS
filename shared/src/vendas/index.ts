import { z } from "zod";
import { paginationQuerySchema } from "../api/index.js";

const uuidSchema = z.string().uuid();
const dinheiroSchema = z.coerce.number().min(0);

export const vendasQuerySchema = z
  .object({
    empresaId: uuidSchema.optional(),
    dataInicio: z.string().min(10).optional(),
    dataFim: z.string().min(10).optional(),
    caixaId: uuidSchema.optional(),
    pdvId: uuidSchema.optional(),
    turnoId: uuidSchema.optional(),
    clienteId: uuidSchema.optional(),
    colaboradorId: uuidSchema.optional(),
    formaPagamentoId: uuidSchema.optional(),
    status: z.string().optional(),
    // Ordem cronologica REAL (por data_venda, desempatando por data_referencia). Sem ela, a
    // ordenacao teria de acontecer no cliente — e ordenaria so a pagina, nao o filtro inteiro.
    // Ausente = mantem o padrao historico (mais recente primeiro) das telas operacionais.
    ordem: z.enum(["asc", "desc"]).optional()
  })
  .merge(paginationQuerySchema);

// Rodape do Relatorio de Vendas: total geral + subtotais por forma de pagamento sobre TODO o
// conjunto filtrado (nao so a pagina). Usado na homologacao contra o CREARE.
export const totalPorFormaPagamentoSchema = z.object({
  formaPagamentoId: z.string().nullable(),
  formaPagamento: z.string(),
  total: z.number(),
  quantidade: z.number()
});
export const totaisVendasSchema = z.object({
  totalGeral: z.number(),
  quantidade: z.number(),
  porFormaPagamento: z.array(totalPorFormaPagamentoSchema)
});
export type TotalPorFormaPagamento = z.infer<typeof totalPorFormaPagamentoSchema>;
export type TotaisVendas = z.infer<typeof totaisVendasSchema>;

export const vendaItemSchema = z.object({
  produtoId: uuidSchema.optional().nullable(),
  produtoAutomacaoId: z.string().optional().nullable(),
  produtoAutomacaoCodigo: z.string().optional().nullable(),
  descricaoProduto: z.string().min(1),
  quantidade: z.coerce.number().min(0).default(0),
  valorUnitario: z.coerce.number().min(0).default(0),
  valorTotal: dinheiroSchema
});

export const vendaPagamentoSchema = z.object({
  formaPagamentoId: uuidSchema.optional().nullable(),
  tipoPagamentoAutomacaoId: z.string().optional().nullable(),
  tipoPagamentoAutomacao: z.string().optional().nullable(),
  numeroVendas: z.coerce.number().int().min(0).default(0),
  totalPago: dinheiroSchema
});

export const vendaPayloadSchema = z.object({
  empresaId: uuidSchema,
  dataReferencia: z.string().min(10),
  dataPagamento: z.string().min(10).optional().nullable(),
  descricao: z.string().min(1),
  observacao: z.string().optional().nullable(),
  valorOriginal: dinheiroSchema,
  valorAcrescimo: dinheiroSchema.default(0),
  descricaoAcrescimo: z.string().optional().nullable(),
  valorDesconto: dinheiroSchema.default(0),
  descricaoDesconto: z.string().optional().nullable(),
  contaOrigemId: uuidSchema.optional().nullable(),
  pdvId: uuidSchema.optional().nullable(),
  colaboradorId: uuidSchema.optional().nullable(),
  computar: z.boolean().default(true),
  itensVenda: z.array(vendaItemSchema).default([]),
  tiposPagamento: z.array(vendaPagamentoSchema).default([])
});

export const vendaDtoSchema = z.object({
  id: z.string(),
  empresaId: z.string(),
  // Data contabil (date-only, "yyyy-MM-dd"): NAO tem hora. Quem precisa da hora usa dataVenda.
  dataReferencia: z.string(),
  // Momento real da venda (timestamp ISO), vindo da integracao. Null em venda manual, que so
  // registra a data contabil — por isso a tela mostra "-" na coluna Hora.
  dataVenda: z.string().nullable().optional(),
  dataPagamento: z.string().nullable().optional(),
  descricao: z.string(),
  valorOriginal: z.string(),
  valorAcrescimo: z.string().optional(),
  valorDesconto: z.string().optional(),
  computar: z.boolean(),
  status: z.string(),
  pdvId: z.string().nullable().optional(),
  pdvNome: z.string().nullable().optional(),
  clienteId: z.string().nullable().optional(),
  clienteNome: z.string().nullable().optional(),
  colaboradorId: z.string().nullable().optional(),
  colaboradorNome: z.string().nullable().optional(),
  pagamentos: z
    .array(
      z.object({
        id: z.string(),
        formaPagamentoId: z.string().nullable(),
        formaPagamentoNome: z.string().nullable(),
        totalPago: z.string()
      })
    )
    .default([]),
  totalComprovantes: z.number().int().min(0).default(0)
});

export const vendaParamsSchema = z.object({
  vendaId: uuidSchema
});

export const vendaComprovanteDtoSchema = z.object({
  id: z.string(),
  vendaId: z.string(),
  nomeOriginal: z.string(),
  nomeArquivo: z.string(),
  caminho: z.string(),
  mimeType: z.string(),
  tamanhoBytes: z.number(),
  criadoEm: z.string()
});

export const vendaCriadaSchema = z.object({
  id: z.string(),
  computar: z.boolean()
});

export type VendasQuery = z.input<typeof vendasQuerySchema>;
export type VendaPayload = z.infer<typeof vendaPayloadSchema>;

// Detalhe para edicao: payload completo (com filhos) + identificacao do registro.
export type VendaDetalheDto = VendaPayload & { id: string; status: string; caixaId: string | null };
export type VendaDto = z.infer<typeof vendaDtoSchema>;
export type VendaCriada = z.infer<typeof vendaCriadaSchema>;
export type VendaParams = z.infer<typeof vendaParamsSchema>;
export type VendaComprovanteDto = z.infer<typeof vendaComprovanteDtoSchema>;
