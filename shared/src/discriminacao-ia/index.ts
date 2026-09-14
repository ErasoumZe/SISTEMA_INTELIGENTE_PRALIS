import { z } from "zod";

export const categoriaDiscriminacaoIaSchema = z.enum(["despesa", "mercadoria"]);

export const analisarNotaFiscalIaQuerySchema = z.object({
  empresaId: z.string().uuid(),
  categoria: categoriaDiscriminacaoIaSchema
});

const decimalIaSchema = z.string().regex(/^\d+(?:\.\d{1,4})?$/);

export const itemNotaFiscalIaSchema = z.object({
  descricao: z.string().min(1).max(500),
  codigo: z.string().max(80).nullable(),
  ean: z.string().max(32).nullable(),
  quantidade: decimalIaSchema.nullable(),
  valorUnitario: decimalIaSchema.nullable(),
  desconto: decimalIaSchema.nullable(),
  valorTotal: decimalIaSchema.nullable(),
  produtoId: z.string().uuid().nullable(),
  grupoMercadoriaId: z.string().uuid().nullable(),
  unidadeMedidaId: z.string().uuid().nullable(),
  cadastrado: z.boolean(),
  confianca: z.number().min(0).max(1),
  camposDuvidosos: z.array(z.string().max(80)).max(20)
});

export const analiseNotaFiscalIaSchema = z.object({
  documentoLegivel: z.boolean(),
  fornecedor: z.object({
    nome: z.string().max(300).nullable(),
    cnpj: z
      .string()
      .regex(/^\d{14}$/)
      .nullable(),
    fornecedorId: z.string().uuid().nullable(),
    cadastrado: z.boolean(),
    confianca: z.number().min(0).max(1),
    duvidoso: z.boolean()
  }),
  numero: z.string().max(30).nullable(),
  serie: z.string().max(20).nullable(),
  dataEmissao: z.string().date().nullable(),
  chaveNfeIdentificada: z.boolean(),
  chaveNfeFinal: z
    .string()
    .regex(/^\d{4}$/)
    .nullable(),
  itens: z.array(itemNotaFiscalIaSchema).max(200),
  valorProdutos: decimalIaSchema.nullable(),
  valorDesconto: decimalIaSchema.nullable(),
  valorFrete: decimalIaSchema.nullable(),
  valorTotal: decimalIaSchema.nullable(),
  camposDuvidosos: z.array(z.string().max(120)).max(100),
  validacoes: z.object({
    somaItens: decimalIaSchema,
    somaItensConfere: z.boolean().nullable(),
    totalCalculado: decimalIaSchema,
    valorTotalConfere: z.boolean().nullable(),
    possivelDuplicata: z.boolean(),
    motivoDuplicidade: z.string().max(300).nullable()
  }),
  avisos: z.array(z.string().max(300)).max(50)
});

export type CategoriaDiscriminacaoIa = z.infer<typeof categoriaDiscriminacaoIaSchema>;
export type AnalisarNotaFiscalIaQuery = z.infer<typeof analisarNotaFiscalIaQuerySchema>;
export type ItemNotaFiscalIa = z.infer<typeof itemNotaFiscalIaSchema>;
export type AnaliseNotaFiscalIa = z.infer<typeof analiseNotaFiscalIaSchema>;
