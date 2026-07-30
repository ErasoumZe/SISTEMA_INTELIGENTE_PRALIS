import { z } from "zod";
import { paginationQuerySchema } from "../api/index.js";
import { itemTemGrupoDeDuasOrigens, MENSAGEM_GRUPO_DE_DUAS_ORIGENS } from "../discriminacao/index.js";

const uuidSchema = z.string().uuid();
const dinheiroSchema = z.coerce.number().min(0);

export const despesasQuerySchema = z
  .object({
    empresaId: uuidSchema.optional(),
    dataInicio: z.string().min(10).optional(),
    dataFim: z.string().min(10).optional(),
    caixaId: uuidSchema.optional(),
    pdvId: uuidSchema.optional(),
    // somentePendentes = pendente de PAGAMENTO (dataPagamento nula). Nao confundir com o abaixo.
    somentePendentes: z.coerce.boolean().optional().default(false),
    // Fila de pendencias de discriminacao: cabecalhos sem nenhum item.
    pendenteDiscriminacao: z.coerce.boolean().optional()
  })
  .merge(paginationQuerySchema);

export const tiposDescontoItemDespesa = ["percentual", "valor"] as const;

export const despesaItemSchema = z
  .object({
    grupoDespesaId: uuidSchema.optional().nullable(),
    // Grupo vindo do cadastro de PATRIMONIO (§5). Exclusivo com grupoDespesaId — ver o refine.
    grupoPatrimonioId: uuidSchema.optional().nullable(),
    colaboradorId: uuidSchema.optional().nullable(),
    descricao: z.string().min(1),
    // Quantidade/unitario chegaram com os 3 niveis de desconto (§5). O item de despesa continua
    // podendo ser so "descricao + valor": sem quantidade, o servidor assume 1 x valor.
    quantidade: z.coerce.number().positive().optional(),
    valorUnitario: z.coerce.number().min(0).optional(),
    // Nivel 1: no V.UNIT (R$ POR UNIDADE quando 'valor'). Nivel 2: no V.TOTAL do item.
    descontoTipo: z.enum(tiposDescontoItemDespesa).optional().nullable(),
    descontoValor: z.coerce.number().min(0).optional().nullable(),
    descontoTotalTipo: z.enum(tiposDescontoItemDespesa).optional().nullable(),
    descontoTotalValor: z.coerce.number().min(0).optional().nullable(),
    valor: dinheiroSchema
  })
  .superRefine((item, ctx) => {
    if (itemTemGrupoDeDuasOrigens(item.grupoDespesaId, item.grupoPatrimonioId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["grupoPatrimonioId"],
        message: MENSAGEM_GRUPO_DE_DUAS_ORIGENS
      });
    }
  });

export const despesaPayloadSchema = z.object({
  empresaId: uuidSchema,
  dataReferencia: z.string().min(10),
  dataVencimento: z.string().min(10),
  dataPagamento: z.string().min(10).optional().nullable(),
  descricao: z.string().min(1),
  observacao: z.string().optional().nullable(),
  valorOriginal: dinheiroSchema,
  valorAcrescimo: dinheiroSchema.default(0),
  descricaoAcrescimo: z.string().optional().nullable(),
  valorDesconto: dinheiroSchema.default(0),
  descricaoDesconto: z.string().optional().nullable(),
  // Nivel 3 — desconto GERAL: guarda COMO foi informado. O R$ resolvido vai para valorDesconto.
  descontoGeralTipo: z.enum(tiposDescontoItemDespesa).optional().nullable(),
  descontoGeralValor: z.coerce.number().min(0).optional().nullable(),
  contaOrigemId: uuidSchema.optional().nullable(),
  fornecedorId: uuidSchema.optional().nullable(),
  colaboradorId: uuidSchema.optional().nullable(),
  grupoDespesaId: uuidSchema.optional().nullable(),
  computar: z.boolean().default(true),
  fotoDocumentoUrl: z.string().optional().nullable(),
  itensDespesa: z.array(despesaItemSchema).default([])
});

export const despesaDtoSchema = z.object({
  id: z.string(),
  empresaId: z.string(),
  dataReferencia: z.string(),
  dataVencimento: z.string().optional(),
  dataPagamento: z.string().nullable().optional(),
  descricao: z.string(),
  valorOriginal: z.string(),
  computar: z.boolean(),
  status: z.string(),
  // Foto do documento (nota/cupom): insumo de quem discrimina. Null quando nao anexada.
  fotoDocumentoUrl: z.string().nullable(),
  // Derivado: cabecalho sem itens ainda nao foi discriminado.
  pendenteDiscriminacao: z.boolean()
});

// Discriminacao: so os itens (o cabecalho ja existe). Nao passa pela trava de caixa aberto.
// O desconto GERAL (nivel 3) vem junto: e nesta tela que ele e informado, e e ele que rateia.
export const discriminarDespesaSchema = z.object({
  empresaId: uuidSchema,
  descontoGeralTipo: z.enum(tiposDescontoItemDespesa).optional().nullable(),
  descontoGeralValor: z.coerce.number().min(0).optional().nullable(),
  itensDespesa: z.array(despesaItemSchema).min(1)
});

export const despesaCriadaSchema = z.object({
  id: z.string(),
  computar: z.boolean()
});

export type DespesasQuery = z.input<typeof despesasQuerySchema>;
export type DespesaPayload = z.infer<typeof despesaPayloadSchema>;
export type DespesaItemPayload = z.infer<typeof despesaItemSchema>;
export type DiscriminarDespesaPayload = z.infer<typeof discriminarDespesaSchema>;

// Detalhe para edicao: payload completo (com filhos) + identificacao do registro.
export type DespesaDetalheDto = DespesaPayload & { id: string; status: string; caixaId: string | null };
export type DespesaDto = z.infer<typeof despesaDtoSchema>;
export type DespesaCriada = z.infer<typeof despesaCriadaSchema>;
