import { z } from "zod";
import {
  empresaQuerySchema,
  exportarEmpresaPayloadSchema,
  apiIdParamsSchema,
  importarEmpresaPayloadSchema,
  type ExportarEmpresaPayload,
  type ImportarEmpresaPayload
} from "../api/index.js";

const uuidSchema = z.string().uuid();

export const produtoConversaoPayloadSchema = z.object({
  id: uuidSchema.optional(),
  unidadeMedidaId: uuidSchema,
  quantidade: z.coerce.number().positive(),
  unidadesIndividuais: z.coerce.number().positive()
});

export const produtoPayloadSchema = z.object({
  empresaId: uuidSchema,
  codigo: z.string().optional().nullable(),
  codigoBarras: z.string().optional().nullable(),
  descricao: z.string().min(1),
  marca: z.string().optional().nullable(),
  unidadeIndividualId: uuidSchema,
  quantidadeIndividual: z.coerce.number().positive(),
  grupoMercadoriaId: uuidSchema.optional().nullable(),
  conversoes: z.array(produtoConversaoPayloadSchema).default([])
});

export const produtosQuerySchema = empresaQuerySchema;
export const importarProdutosSchema = importarEmpresaPayloadSchema;
export const exportarProdutoSchema = exportarEmpresaPayloadSchema;
export const produtoParamsSchema = apiIdParamsSchema;

export type ProdutoPayload = z.infer<typeof produtoPayloadSchema>;
export type ProdutoConversaoPayload = z.infer<typeof produtoConversaoPayloadSchema>;
export type ImportarProdutosPayload = ImportarEmpresaPayload;
export type ExportarProdutoPayload = ExportarEmpresaPayload;

