import { z } from "zod";
import { paginationQuerySchema } from "../api/index.js";
import { itemTemGrupoDeDuasOrigens, MENSAGEM_GRUPO_DE_DUAS_ORIGENS } from "../discriminacao/index.js";
import { recorrenciaSchema, resultadoSerieSchema } from "../recorrencia/index.js";

const uuidSchema = z.string().uuid();
const dinheiroSchema = z.coerce.number().min(0);

export const mercadoriasQuerySchema = z
  .object({
    empresaId: uuidSchema.optional(),
    caixaId: uuidSchema.optional(),
    // Fila de pendencias de discriminacao: cabecalhos sem nenhum item.
    pendenteDiscriminacao: z.coerce.boolean().optional()
  })
  .merge(paginationQuerySchema);

export const tiposDescontoItem = ["percentual", "valor"] as const;

export const mercadoriaItemSchema = z
  .object({
    produtoId: uuidSchema.optional().nullable(),
    grupoMercadoriaId: uuidSchema.optional().nullable(),
    // Grupo vindo do cadastro de PATRIMONIO (§5). Exclusivo com grupoMercadoriaId — ver o refine.
    grupoPatrimonioId: uuidSchema.optional().nullable(),
    unidadeMedidaId: uuidSchema.optional().nullable(),
    descricao: z.string().min(1),
    quantidade: z.coerce.number().positive(),
    valorUnitario: z.coerce.number().min(0).default(0),
    // Descontos por NIVEL (§5). tipo nulo = sem desconto naquele nivel; valor e % ('percentual') ou
    // R$ ('valor'). O servidor recalcula os totais — o cliente nao decide dinheiro.
    // Nivel 1: no V.UNIT (R$ POR UNIDADE quando 'valor').
    descontoTipo: z.enum(tiposDescontoItem).optional().nullable(),
    descontoValor: z.coerce.number().min(0).optional().nullable(),
    // Nivel 2: no V.TOTAL do item.
    descontoTotalTipo: z.enum(tiposDescontoItem).optional().nullable(),
    descontoTotalValor: z.coerce.number().min(0).optional().nullable(),
    valorTotal: dinheiroSchema
  })
  .superRefine((item, ctx) => {
    if (itemTemGrupoDeDuasOrigens(item.grupoMercadoriaId, item.grupoPatrimonioId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["grupoPatrimonioId"],
        message: MENSAGEM_GRUPO_DE_DUAS_ORIGENS
      });
    }
  });

export const mercadoriaPayloadSchema = z.object({
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
  descontoGeralTipo: z.enum(tiposDescontoItem).optional().nullable(),
  descontoGeralValor: z.coerce.number().min(0).optional().nullable(),
  contaOrigemId: uuidSchema.optional().nullable(),
  fornecedorId: uuidSchema,
  grupoMercadoriaId: uuidSchema.optional().nullable(),
  notaFiscalId: z.string().optional().nullable(),
  temNotaFiscal: z.boolean().default(false),
  computar: z.boolean().default(true),
  fotoDocumentoUrl: z.string().optional().nullable(),
  // Recorrencia (D3): presente = o servidor cria a serie inteira no salvar. Exige permissao.
  recorrencia: recorrenciaSchema.optional(),
  itensMercadoria: z.array(mercadoriaItemSchema).default([])
});

export const mercadoriaDtoSchema = z.object({
  id: z.string(),
  empresaId: z.string(),
  dataReferencia: z.string(),
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
export const discriminarMercadoriaSchema = z.object({
  empresaId: uuidSchema,
  descontoGeralTipo: z.enum(tiposDescontoItem).optional().nullable(),
  descontoGeralValor: z.coerce.number().min(0).optional().nullable(),
  itensMercadoria: z.array(mercadoriaItemSchema).min(1)
});

// Fila de aprovacao: mercadorias vindas da NF-e nascem "aguardando_aprovacao" (computar=false,
// sem caixa) ja com os itens do XML. A retaguarda aprova (definindo se computa) ou recusa.
export const mercadoriasAprovacaoQuerySchema = z
  .object({ empresaId: uuidSchema.optional() })
  .merge(paginationQuerySchema);

export const aprovarMercadoriaSchema = z.object({
  empresaId: uuidSchema,
  // Decisao da reuniao: nota so fiscal nao computa; a retaguarda escolhe no momento da aprovacao.
  computar: z.boolean()
});

export const recusarMercadoriaSchema = z.object({
  empresaId: uuidSchema,
  motivo: z.string().trim().optional().nullable()
});

export const mercadoriaAprovacaoItemDtoSchema = z.object({
  descricao: z.string(),
  quantidade: z.string(),
  valorUnitario: z.string(),
  valorTotal: z.string()
});

export const mercadoriaAprovacaoDtoSchema = z.object({
  id: z.string(),
  empresaId: z.string(),
  dataReferencia: z.string(),
  dataVencimento: z.string(),
  descricao: z.string(),
  valorOriginal: z.string(),
  computar: z.boolean(),
  fornecedorId: z.string().nullable(),
  fornecedorNome: z.string().nullable(),
  notaFiscalId: z.string().nullable(),
  itens: z.array(mercadoriaAprovacaoItemDtoSchema)
});

export const mercadoriaCriadaSchema = z.object({
  id: z.string(),
  computar: z.boolean(),
  ...resultadoSerieSchema
});

export type MercadoriasQuery = z.input<typeof mercadoriasQuerySchema>;
export type MercadoriaPayload = z.infer<typeof mercadoriaPayloadSchema>;
export type MercadoriaItemPayload = z.infer<typeof mercadoriaItemSchema>;
export type DiscriminarMercadoriaPayload = z.infer<typeof discriminarMercadoriaSchema>;
export type MercadoriasAprovacaoQuery = z.input<typeof mercadoriasAprovacaoQuerySchema>;
export type AprovarMercadoriaPayload = z.infer<typeof aprovarMercadoriaSchema>;
export type RecusarMercadoriaPayload = z.infer<typeof recusarMercadoriaSchema>;
export type MercadoriaAprovacaoDto = z.infer<typeof mercadoriaAprovacaoDtoSchema>;
export type TipoDescontoItem = (typeof tiposDescontoItem)[number];

// Detalhe para edicao: payload completo (com filhos) + identificacao do registro.
export type MercadoriaDetalheDto = MercadoriaPayload & { id: string; status: string; caixaId: string | null };
export type MercadoriaDto = z.infer<typeof mercadoriaDtoSchema>;
export type MercadoriaCriada = z.infer<typeof mercadoriaCriadaSchema>;
