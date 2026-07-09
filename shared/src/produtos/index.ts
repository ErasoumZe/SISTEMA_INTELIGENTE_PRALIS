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
  icms: z.coerce.number().min(0).optional().nullable()
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
  produtoReceituario: z.string().optional().nullable()
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

export const produtoPayloadSchema = z.object({
  empresaId: uuidSchema,
  codigo: z.string().optional().nullable(),
  codigoBarras: z.string().optional().nullable(),
  descricao: z.string().min(1),
  marca: z.string().optional().nullable(),
  unidadeIndividualId: uuidSchema,
  quantidadeIndividual: z.coerce.number().positive(),
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
  // Estoque (saldo + parametrizacao), locais de venda e foto.
  quantidadeEstoque: z.coerce.number().min(0).optional().nullable(),
  estoqueMin: z.coerce.number().min(0).optional().nullable(),
  estoqueMax: z.coerce.number().min(0).optional().nullable(),
  setorEstoque: z.string().optional().nullable(),
  localVenda1: z.string().optional().nullable(),
  localVenda2: z.string().optional().nullable(),
  fotoUrl: z.string().optional().nullable(),
  fiscal: produtoFiscalSchema.optional().nullable(),
  transformacao: produtoTransformacaoSchema.optional().nullable(),
  promocoes: z.array(produtoPromocaoSchema).default([]),
  // Governanca: "cadastrar mesmo assim" — pula a checagem de duplicado (nome/codigo de barras na loja).
  forcar: z.boolean().optional().default(false)
});

export const produtosQuerySchema = empresaQuerySchema;
export const importarProdutosSchema = importarEmpresaPayloadSchema;
export const exportarProdutoSchema = exportarEmpresaPayloadSchema;
export const produtoParamsSchema = apiIdParamsSchema;

export type ProdutoPayload = z.infer<typeof produtoPayloadSchema>;
export type ProdutoConversaoPayload = z.infer<typeof produtoConversaoPayloadSchema>;
export type ImportarProdutosPayload = ImportarEmpresaPayload;
export type ExportarProdutoPayload = ExportarEmpresaPayload;

export * from "./regras.js";
