import { z } from "zod";

const uuid = z.string().uuid();
const empresa = z.object({ empresaId: uuid });

export const catalogoFornecedorQuerySchema = empresa.extend({
  fornecedorId: uuid.optional(),
  status: z.enum(["pendente", "aprovado", "rejeitado"]).optional()
});

export const catalogoFornecedorPayloadSchema = empresa.extend({
  fornecedorId: uuid,
  produtoId: uuid,
  precoOfertado: z.coerce.number().min(0).optional().nullable(),
  observacao: z.string().trim().max(1_000).optional().nullable()
});

export const catalogoFornecedorDecisaoSchema = empresa.extend({
  status: z.enum(["aprovado", "rejeitado"]),
  observacao: z.string().trim().max(1_000).optional().nullable()
});

export const importacaoPrecoBaseLinhaSchema = z.object({
  numeroLinha: z.coerce.number().int().positive(),
  codigo: z.string().trim().optional().nullable(),
  ean: z.string().trim().optional().nullable(),
  descricao: z.string().trim().min(1),
  ultimoMenorCusto: z.coerce.number().min(0)
});

export const analisarImportacaoPrecoBaseSchema = empresa.extend({
  nomeArquivo: z.string().trim().min(1).max(255),
  hashArquivo: z.string().trim().min(16).max(128),
  linhas: z.array(importacaoPrecoBaseLinhaSchema).min(1).max(50_000)
});

export const aplicarImportacaoPrecoBaseSchema = empresa;
export const importacoesPrecoBaseQuerySchema = empresa;

export type CatalogoFornecedorPayload = z.infer<typeof catalogoFornecedorPayloadSchema>;
export type CatalogoFornecedorDecisao = z.infer<typeof catalogoFornecedorDecisaoSchema>;
export type AnalisarImportacaoPrecoBase = z.infer<typeof analisarImportacaoPrecoBaseSchema>;

export function normalizarDescricaoPrecoBase(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleUpperCase("pt-BR")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
