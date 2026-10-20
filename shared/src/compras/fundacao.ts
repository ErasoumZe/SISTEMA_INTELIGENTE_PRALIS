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

/**
 * Teto de linhas por importacao. Vale para as DUAS portas de entrada (JSON e upload .xlsx): a de
 * arquivo montava o payload a mao e passava por fora do contrato, e o casamento linha x produto mais
 * o INSERT unico nao sobrevivem a uma planilha arbitrariamente grande.
 */
export const LIMITE_LINHAS_PRECO_BASE = 50_000;

export const importacaoPrecoBaseLinhaSchema = z.object({
  numeroLinha: z.coerce.number().int().positive(),
  codigo: z.string().trim().optional().nullable(),
  ean: z.string().trim().optional().nullable(),
  descricao: z.string().trim().min(1),
  // Positivo, nao `min(0)`: base zero reprovaria toda compra automatica (R-220). O teto espelha
  // `numeric(14,4)`, que tem dez digitos inteiros — acima disso o banco responde 22003.
  ultimoMenorCusto: z.coerce.number().positive().lt(1e10)
});

export const analisarImportacaoPrecoBaseSchema = empresa.extend({
  nomeArquivo: z.string().trim().min(1).max(255),
  hashArquivo: z.string().trim().min(16).max(128),
  linhas: z.array(importacaoPrecoBaseLinhaSchema).min(1).max(LIMITE_LINHAS_PRECO_BASE)
});

export const aplicarImportacaoPrecoBaseSchema = empresa;
export const importacoesPrecoBaseQuerySchema = empresa;

/**
 * Detalhe da analise. `somentePendencias` existe porque a tela que consome este endpoint mostra
 * exatamente o que BLOQUEIA a aplicacao: sem o filtro, uma analise de 20.000 linhas com 300
 * pendencias mandava as 20.000 para o navegador descartar 19.700.
 */
export const importacaoPrecoBaseDetalheQuerySchema = empresa.extend({
  somentePendencias: z
    .enum(["true", "false"])
    .optional()
    .transform((valor) => valor === "true")
});

/** Teto de linhas por resposta de listagem de preco-base. */
export const LIMITE_PAGINA_PRECO_BASE = 200;

export const precosBaseQuerySchema = empresa.extend({
  limite: z.coerce.number().int().positive().max(LIMITE_PAGINA_PRECO_BASE).default(LIMITE_PAGINA_PRECO_BASE)
});

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
