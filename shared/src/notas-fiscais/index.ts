import { z } from "zod";
import { paginationQuerySchema } from "../api/index.js";

const uuidSchema = z.string().uuid();
const dataIsoSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato yyyy-MM-dd");

export const statusImportacaoNotaFiscal = ["pendente_revisao", "revisada", "ignorada", "cancelada"] as const;
export type StatusImportacaoNotaFiscal = (typeof statusImportacaoNotaFiscal)[number];

// Datas em ISO (yyyy-MM-dd); o servidor converte para dd/MM/yyyy exigido pelo webhook da contabilidade.
export const importarNotasFiscaisPayloadSchema = z
  .object({
    empresaId: uuidSchema,
    dataInicio: dataIsoSchema,
    dataFim: dataIsoSchema
  })
  .refine((valor) => valor.dataInicio <= valor.dataFim, {
    message: "dataInicio deve ser anterior ou igual a dataFim",
    path: ["dataFim"]
  });

export const notasFiscaisQuerySchema = z
  .object({
    empresaId: uuidSchema.optional(),
    statusImportacao: z.enum(statusImportacaoNotaFiscal).optional()
  })
  .merge(paginationQuerySchema);

export const notaFiscalItemDtoSchema = z.object({
  numeroItem: z.number().nullable(),
  ean: z.string().nullable(),
  ncm: z.string().nullable(),
  cfop: z.string().nullable(),
  cest: z.string().nullable(),
  descricao: z.string().nullable(),
  unidadeComercial: z.string().nullable(),
  quantidade: z.number().nullable(),
  valorUnitario: z.number().nullable()
});

export const notaFiscalDtoSchema = z.object({
  id: z.string(),
  empresaId: z.string(),
  chave: z.string(),
  numero: z.string().nullable(),
  serie: z.string().nullable(),
  dataEmissao: z.string().nullable(),
  fornecedorNome: z.string().nullable(),
  fornecedorCnpj: z.string().nullable(),
  fornecedorId: z.string().nullable(),
  valorTotal: z.string().nullable(),
  dataVencimento: z.string().nullable(),
  mercadoriaId: z.string().nullable(),
  statusImportacao: z.string()
});

export const notaFiscalDetalheDtoSchema = notaFiscalDtoSchema.extend({
  modelo: z.string().nullable(),
  naturezaOperacao: z.string().nullable(),
  valorProdutos: z.string().nullable(),
  valorDesconto: z.string().nullable(),
  valorFrete: z.string().nullable(),
  valorOutros: z.string().nullable(),
  valorSeguro: z.string().nullable(),
  itens: z.array(notaFiscalItemDtoSchema)
});

export const importarNotasFiscaisResultadoSchema = z.object({
  totalNotas: z.number(),
  importadas: z.number(),
  puladas: z.number(),
  erros: z.number(),
  periodo: z.object({ dataInicio: z.string(), dataFim: z.string() }),
  detalhesErros: z.array(z.object({ chave: z.string().nullable(), mensagem: z.string() }))
});

export type ImportarNotasFiscaisPayload = z.infer<typeof importarNotasFiscaisPayloadSchema>;
export type NotasFiscaisQuery = z.input<typeof notasFiscaisQuerySchema>;
export type NotaFiscalDto = z.infer<typeof notaFiscalDtoSchema>;
export type NotaFiscalItemDto = z.infer<typeof notaFiscalItemDtoSchema>;
export type NotaFiscalDetalheDto = z.infer<typeof notaFiscalDetalheDtoSchema>;
export type ImportarNotasFiscaisResultado = z.infer<typeof importarNotasFiscaisResultadoSchema>;
