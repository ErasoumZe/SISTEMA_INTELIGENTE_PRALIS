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

export const statusProdutoSchema = z.enum(["ativo", "inativo"]);
export const tipoProdutoSchema = z.enum(["revenda", "transformacao"]);

// "Como se compra": embalagem e medida de compra deixaram de ser enums fixos do Pralis
// (MEDIDAS1/MEDIDAS2) e passaram a vir do cadastro de Unidades — a UI lista
// opcoesEmpresa.unidadesMedida e grava a sigla; por isso validamos como texto livre.
export const embalagemSchema = z.string().trim().min(1);
export const cDeSchema = z.enum(["C/", "DE"]);
export const medidaCompraSchema = z.string().trim().min(1);

// Dados fiscais (1:1). Porte de product_fiscal do Pralis. Aliquotas em % (como no formulario do Pralis);
// nao ha calculo fiscal (nem no Pralis nem no ERP) — os campos so sao armazenados.
export const produtoFiscalSchema = z.object({
  ncm: z.string().optional().nullable(),
  cest: z.string().optional().nullable(),
  categoriaFiscal: z.string().optional().nullable(),
  cstPisCofins: z.string().optional().nullable(),
  aliquotaCheia: z.coerce.number().min(0).optional().nullable(),
  aliquotaFcp: z.coerce.number().min(0).optional().nullable(),
  aliquotaPis: z.coerce.number().min(0).optional().nullable(),
  aliquotaCofins: z.coerce.number().min(0).optional().nullable(),
  reducaoIcms: z.coerce.number().min(0).optional().nullable(),
  icms: z.coerce.number().min(0).optional().nullable(),
  tributacaoSimples: z.string().optional().nullable(),
  aliquotaSimples: z.coerce.number().min(0).optional().nullable(),
  icmsRe: z.coerce.number().min(0).optional().nullable(),
  baseFiscal: z.string().optional().nullable(),
  codigoFiscal: z.string().optional().nullable(),
  produtoFiscal: z.string().optional().nullable(),
  cstReforma: z.string().optional().nullable(),
  cClassTrib: z.string().optional().nullable(),
  aliquotaIbs: z.coerce.number().min(0).optional().nullable(),
  aliquotaCbs: z.coerce.number().min(0).optional().nullable(),
  origemFiscal: z.string().optional().nullable(),
  aliquotaEcf: z.string().optional().nullable(),
  aliquotaEcfId: z.string().optional().nullable(),
  estado: z.string().optional().nullable(),
  motivo: z.string().optional().nullable(),
  conferidoEm: z.string().datetime().optional().nullable(),
  pctNcm: z.coerce.number().min(0).optional().nullable()
});

export const precisaoSchema = z.enum(["EXATOS", "APROXIMADOS"]);
// Unidade da transformacao tambem passou a vir do cadastro de Unidades (grava a sigla) — texto livre.
export const unidadeTransformacaoSchema = z.string().trim().min(1);
export const tipoPromocaoSchema = z.enum(["valor", "desconto"]);

// Ficha de transformacao (1:1, quando tipo = transformacao). Porte de product_transformacao do Pralis.
export const produtoTransformacaoSchema = z.object({
  precisao: precisaoSchema.optional().nullable(),
  quantidade: z.coerce.number().min(0).optional().nullable(),
  unidade: unidadeTransformacaoSchema.optional().nullable(),
  produtoReceituario: z.string().optional().nullable(),
  refReceituario: z.string().optional().nullable()
});

// Promocao (1:N). Porte de promocoes do Pralis: preco fixo ou desconto (fracao), janela + dias da semana.
export const produtoPromocaoSchema = z.object({
  tipo: tipoPromocaoSchema,
  valor: z.coerce.number().min(0).optional().nullable(),
  descontoFracao: z.coerce.number().min(0).optional().nullable(),
  horaInicio: z.string().optional().nullable(),
  horaFim: z.string().optional().nullable(),
  seg: z.boolean().optional().default(false),
  ter: z.boolean().optional().default(false),
  qua: z.boolean().optional().default(false),
  qui: z.boolean().optional().default(false),
  sex: z.boolean().optional().default(false),
  sab: z.boolean().optional().default(false),
  dom: z.boolean().optional().default(false),
  validaAte: z.string().optional().nullable()
});

export const produtoPayloadSchema = z
  .object({
    empresaId: uuidSchema,
    codigo: z.string().optional().nullable(),
    codigoBarras: z.string().optional().nullable(),
    descricao: z.string().min(1),
    nomeCatalogo: z.string().trim().min(1).max(200).optional().nullable(),
    pesavel: z.boolean().nullable().optional(),
    teclaBalanca: z.coerce.number().int().min(0).nullable().optional(),
    validadeBalanca: z.coerce.number().int().min(0).nullable().optional(),
    grupoIdExterno: z.string().trim().max(120).nullable().optional(),
    areaVenda: z
      .enum([
        "caixa",
        "vitrine",
        "copa",
        "chapa",
        "mesas",
        "vasca_paes",
        "vitrine_paes",
        "paes_empacotados",
        "mesa_paes",
        "frios",
        "bebidas",
        "laticinios",
        "mercearia",
        "estoque_bebidas",
        "biscoitos",
        "dml_limpeza"
      ])
      .nullable()
      .optional(),
    marca: z.string().optional().nullable(),
    unidadeIndividualId: uuidSchema,
    // Gramatura 0 e valida (produto sem peso por unidade), como no app oficial.
    quantidadeIndividual: z.coerce.number().min(0),
    grupoMercadoriaId: uuidSchema.optional().nullable(),
    conversoes: z.array(produtoConversaoPayloadSchema).default([]),
    // Como se compra (porte do Pralis): embalagem + preposicao + unidades por caixa + medida de compra.
    embalagem: embalagemSchema.optional().nullable(),
    cDe: cDeSchema.optional().nullable(),
    quantidadeCaixa: z.coerce.number().int().positive().optional().default(1),
    medidaCompra: medidaCompraSchema.optional().nullable(),
    // Comercial (por loja) — preco de venda e REFERENCIA de catalogo; margem em fracao (0.30 = 30%).
    custo: z.coerce.number().min(0).optional().nullable(),
    margem: z.coerce.number().min(0).optional().nullable(),
    precoVenda: z.coerce.number().min(0).optional().nullable(),
    auto: z.boolean().optional().default(false),
    status: statusProdutoSchema.optional().default("ativo"),
    tipo: tipoProdutoSchema.optional().default("revenda"),
    // Parametrizacao de estoque. O saldo e somente leitura e muda por movimentos auditados.
    estoqueMin: z.coerce.number().min(0).optional().nullable(),
    estoqueMax: z.coerce.number().min(0).optional().nullable(),
    areaEstoque: z.string().trim().max(120).optional().nullable(),
    setorEstoque: z.string().optional().nullable(),
    curvaAbc: z.enum(["A", "B", "C"]).optional().nullable(),
    quantidadeVariavel: z.boolean().optional().default(false),
    // A faixa 0–30 e da R-218. O vinculo com `quantidadeVariavel` e checado depois, no `superRefine` do
    // schema: o servico descartava a tolerancia em silencio quando o produto nao era de quantidade
    // variavel, e campo que o cliente manda e o servidor joga fora sem avisar e a mesma classe de
    // problema que "campo que aparece e nao salva".
    toleranciaQuantidadePercentual: z.coerce.number().min(0).max(30).optional().nullable(),
    localVenda1: z.string().optional().nullable(),
    localVenda2: z.string().optional().nullable(),
    compraAproximada: z.boolean().optional().default(false),
    habilitarAjuda: z.boolean().optional().default(false),
    setorVenda1: z.string().optional().nullable(),
    setorVenda2: z.string().optional().nullable(),
    fotoUrl: z.string().optional().nullable(),
    fiscal: produtoFiscalSchema.optional().nullable(),
    transformacao: produtoTransformacaoSchema.optional().nullable(),
    promocoes: z.array(produtoPromocaoSchema).default([]),
    // Governanca: "cadastrar mesmo assim" — pula a checagem de duplicado (nome/codigo de barras na loja).
    forcar: z.boolean().optional().default(false)
  })
  .superRefine((dados, contexto) => {
    // Espelha o CHECK `produtos_quantidade_variavel_tolerancia_check` da migration 0060. Sem isto o
    // servico silenciosamente trocava a tolerancia por null quando o produto nao era de quantidade
    // variavel: o cliente mandava 15, o banco guardava nada, e ninguem era avisado.
    if (
      !dados.quantidadeVariavel &&
      dados.toleranciaQuantidadePercentual !== null &&
      dados.toleranciaQuantidadePercentual !== undefined
    ) {
      contexto.addIssue({
        code: "custom",
        path: ["toleranciaQuantidadePercentual"],
        message: "Tolerancia so se aplica a produto vendido por peso"
      });
    }
  });

/**
 * Ativar/inativar sem reenviar o produto inteiro. Excluir nao existe (decisao de Jose, 27/10/2026):
 * o produto sai de uso pelo status. Mais de um produto por vez e so do administrador, so para
 * inativar e com a frase de confirmacao — o mesmo cuidado do "excluir em lote" do app oficial.
 */
export const alterarStatusProdutosSchema = z.object({
  empresaId: uuidSchema,
  ids: z.array(uuidSchema).min(1).max(100),
  status: statusProdutoSchema,
  confirmacao: z.string().trim().max(60).optional()
});
export type AlterarStatusProdutosPayload = z.infer<typeof alterarStatusProdutosSchema>;

export function fraseDeInativacaoEmLote(quantidade: number): string {
  return `INATIVAR ${quantidade} PRODUTOS`;
}

// As SEIS ordenacoes da listagem. Sao contrato: o banco ordena, nao o navegador.
export const ordenacaoProdutosSchema = z
  .enum(["recentes", "antigos", "az", "za", "codigo_asc", "codigo_desc"])
  .default("recentes");

/**
 * Listagem completa (tela de Produtos): busca, quatro filtros, seis ordenacoes e paginacao —
 * tudo resolvido no servidor. `pageSize` herda o teto de 100 do `paginationQuerySchema`.
 */
export const produtosListaQuerySchema = empresaQuerySchema.extend({
  busca: z.string().trim().max(120).optional(),
  status: statusProdutoSchema.optional(),
  tipo: tipoProdutoSchema.optional(),
  grupoMercadoriaId: uuidSchema.optional(),
  setorEstoque: z.string().trim().max(120).optional(),
  somenteVendidos: z
    .enum(["true", "false"])
    .optional()
    .transform((valor) => valor === "true"),
  ordenar: ordenacaoProdutosSchema
});

/**
 * Projecao REDUZIDA, para escolher produto em formulario. Nao devolve fiscal, custo, margem nem
 * preco: quem preenche uma mercadoria nao precisa — e nao deve — enxergar o comercial da loja.
 *
 * `ids` hidrata o item ja selecionado, para que a edicao de um registro antigo mostre o rotulo do
 * produto mesmo que ele nao caia na primeira pagina da busca.
 */
export const produtosOpcoesQuerySchema = empresaQuerySchema.extend({
  busca: z.string().trim().max(120).optional(),
  ids: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((valor) => (valor ? valor.split(",").filter(Boolean) : []))
    .pipe(z.array(uuidSchema).max(50))
});

export const produtosQuerySchema = empresaQuerySchema;
export const importarProdutosSchema = importarEmpresaPayloadSchema;
export const exportarProdutoSchema = exportarEmpresaPayloadSchema;
export const produtoParamsSchema = apiIdParamsSchema;

export type OrdenacaoProdutos = z.infer<typeof ordenacaoProdutosSchema>;
export type ProdutosListaQuery = z.infer<typeof produtosListaQuerySchema>;
export type ProdutosOpcoesQuery = z.infer<typeof produtosOpcoesQuerySchema>;

/** O que a listagem devolve por produto. Sem satelites — o detalhe vive em `GET /api/produtos/:id`. */
export interface ProdutoResumo {
  id: string;
  empresaId: string;
  codigo: string | null;
  codigoInterno: string | null;
  codigoBarras: string | null;
  descricao: string;
  nomeCatalogo: string | null;
  pesavel: boolean | null;
  teclaBalanca: number | null;
  validadeBalanca: number | null;
  grupoIdExterno: string | null;
  areaVenda: string | null;
  marca: string | null;
  compraAproximada: boolean;
  habilitarAjuda: boolean;
  tipo: string;
  status: string;
  grupoMercadoriaId: string | null;
  grupoNome: string | null;
  quantidadeIndividual: string;
  unidadeIndividualSigla: string | null;
  quantidadeEstoque: string;
  estoqueMin: string | null;
  estoqueMax: string | null;
  areaEstoque: string | null;
  setorEstoque: string | null;
  curvaAbc: "A" | "B" | "C" | null;
  quantidadeVariavel: boolean;
  toleranciaQuantidadePercentual: string | null;
  precoVenda: string | null;
  precoVendaAtual: number | null;
  fotoUrl: string | null;
  criadoPorNome: string | null;
}

/** Item da projecao reduzida (seletores). */
export interface ProdutoOpcao {
  id: string;
  descricao: string;
  codigoInterno: string | null;
  codigoBarras: string | null;
  marca: string | null;
  status: string;
}

/** Valores existentes para montar os filtros da tela, dentro do escopo do ator. */
export interface FiltrosDeProduto {
  setores: string[];
  grupos: Array<{ id: string; nome: string }>;
}

/**
 * Detalhe completo de `GET /api/produtos/:id`. Numeros vem como STRING porque `numeric` do Postgres
 * atravessa o Drizzle assim — converter no meio do caminho perderia casas decimais.
 */
export interface ProdutoDetalhe {
  id: string;
  empresaId: string;
  grupoMercadoriaId: string | null;
  grupoNome: string | null;
  unidadeMedidaId: string | null;
  unidadeIndividualId: string | null;
  unidadeIndividualSigla: string | null;
  codigo: string | null;
  codigoInterno: string | null;
  codigoBarras: string | null;
  descricao: string;
  nomeCatalogo: string | null;
  pesavel: boolean | null;
  teclaBalanca: number | null;
  validadeBalanca: number | null;
  grupoIdExterno: string | null;
  areaVenda: string | null;
  marca: string | null;
  compraAproximada: boolean;
  habilitarAjuda: boolean;
  quantidadeIndividual: string;
  embalagem: string | null;
  cDe: string | null;
  quantidadeCaixa: number;
  medidaCompra: string | null;
  custo: string | null;
  margem: string | null;
  precoVenda: string | null;
  precoVendaAtual: number | null;
  auto: boolean;
  status: string;
  tipo: string;
  quantidadeEstoque: string;
  estoqueMin: string | null;
  estoqueMax: string | null;
  areaEstoque: string | null;
  setorEstoque: string | null;
  curvaAbc: "A" | "B" | "C" | null;
  quantidadeVariavel: boolean;
  toleranciaQuantidadePercentual: string | null;
  localVenda1: string | null;
  localVenda2: string | null;
  setorVenda1: string | null;
  setorVenda2: string | null;
  fotoUrl: string | null;
  criadoPorNome: string | null;
  conversoes: Array<{
    id: string;
    unidadeMedidaId: string;
    quantidade: string;
    unidadesIndividuais: string;
  }>;
  fiscal: {
    ncm: string | null;
    cest: string | null;
    categoriaFiscal: string | null;
    cstPisCofins: string | null;
    aliquotaCheia: string | null;
    aliquotaFcp: string | null;
    aliquotaPis: string | null;
    aliquotaCofins: string | null;
    reducaoIcms: string | null;
    icms: string | null;
    tributacaoSimples: string | null;
    aliquotaSimples: string | null;
    icmsRe: string | null;
    baseFiscal: string | null;
    codigoFiscal: string | null;
    produtoFiscal: string | null;
    cstReforma: string | null;
    cClassTrib: string | null;
    aliquotaIbs: string | null;
    aliquotaCbs: string | null;
    origemFiscal: string | null;
    aliquotaEcf: string | null;
    aliquotaEcfId: string | null;
    estado: string | null;
    motivo: string | null;
    conferidoEm: string | null;
    pctNcm: string | null;
  } | null;
  transformacao: {
    precisao: string | null;
    quantidade: string | null;
    unidade: string | null;
    produtoReceituario: string | null;
    refReceituario: string | null;
  } | null;
  promocoes: Array<{
    id: string;
    tipo: string;
    valor: string | null;
    descontoFracao: string | null;
    horaInicio: string | null;
    horaFim: string | null;
    seg: boolean;
    ter: boolean;
    qua: boolean;
    qui: boolean;
    sex: boolean;
    sab: boolean;
    dom: boolean;
    validaAte: string | null;
  }>;
}

export type ProdutoPayload = z.infer<typeof produtoPayloadSchema>;
export type ProdutoConversaoPayload = z.infer<typeof produtoConversaoPayloadSchema>;
export type ImportarProdutosPayload = ImportarEmpresaPayload;
export type ExportarProdutoPayload = ExportarEmpresaPayload;

export * from "./regras.js";
export * from "./regras-cadastro.js";
export * from "./fiscal-motor.js";
export * from "./central-reconciliacao.js";
export * from "./central-fontes.js";
export * from "./central-ingestao.js";
