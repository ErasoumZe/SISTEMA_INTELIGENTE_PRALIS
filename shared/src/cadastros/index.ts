import { z } from "zod";
import { paginationQuerySchema } from "../api/index.js";
import { permissoes, rolesUsuario } from "../autenticacao/index.js";

type EntradaExterna = Parameters<z.ZodString["parse"]>[0];

const uuidSchema = z.string().uuid();

export const tipoCadastroParamsSchema = z.object({
  tipo: z.string().min(1)
});

export const tipoCadastroComIdParamsSchema = z.object({
  tipo: z.string().min(1),
  id: z.string().min(1)
});

export const cadastroEmpresaPayloadSchema = z.object({
  nome: z.string().min(1),
  cnpj: z.string().optional().nullable()
});

export const cadastroFornecedorPayloadSchema = z.object({
  empresaId: uuidSchema,
  nome: z.string().min(1),
  documento: z.string().optional().nullable()
});

export const cadastroClientePayloadSchema = z.object({
  empresaId: uuidSchema,
  nome: z.string().min(1),
  documento: z.string().optional().nullable(),
  dataNascimento: z.string().optional().nullable(),
  whatsapp: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  cep: z.string().optional().nullable(),
  rua: z.string().optional().nullable(),
  numero: z.string().optional().nullable(),
  complemento: z.string().optional().nullable(),
  bairro: z.string().optional().nullable(),
  cidade: z.string().optional().nullable(),
  estado: z.string().optional().nullable()
});

export const cadastroColaboradorPayloadSchema = z.object({
  empresaId: uuidSchema,
  nome: z.string().min(1),
  cpf: z.string().optional().nullable(),
  setorId: uuidSchema.optional().nullable(),
  cargoId: uuidSchema
});

export const cadastroContaPayloadSchema = z.object({
  empresaId: uuidSchema,
  nome: z.string().min(1)
});

export const cadastroFormaPagamentoPayloadSchema = z.object({
  empresaId: uuidSchema,
  nome: z.string().min(1)
});

export const cadastroPdvPayloadSchema = z.object({
  empresaId: uuidSchema,
  nome: z.string().min(1),
  contaId: uuidSchema,
  ativo: z.boolean().optional().default(true)
});

export const cadastroUnidadePayloadSchema = z.object({
  empresaId: uuidSchema,
  nome: z.string().min(1),
  sigla: z.string().min(1)
});

export const tipoGrupoCadastroSchema = z.enum(["despesa", "mercadoria", "retirada", "vendas"]);

export const cadastroGrupoPayloadSchema = z.object({
  empresaId: uuidSchema,
  tipoGrupo: tipoGrupoCadastroSchema,
  nome: z.string().min(1),
  grupoPaiId: uuidSchema.optional().nullable()
});

export const cadastroAreaPayloadSchema = z.object({
  empresaId: uuidSchema,
  nome: z.string().min(1)
});

export const cadastroSetorPayloadSchema = z.object({
  empresaId: uuidSchema,
  nome: z.string().min(1),
  areaId: uuidSchema.optional().nullable(),
  setorPaiId: uuidSchema.optional().nullable()
});

export const cadastroProdutoConversaoPayloadSchema = z.object({
  id: uuidSchema.optional(),
  unidadeMedidaId: uuidSchema,
  quantidade: z.coerce.number().positive(),
  unidadesIndividuais: z.coerce.number().positive()
});

export const cadastroProdutoPayloadSchema = z.object({
  empresaId: uuidSchema,
  codigo: z.string().optional().nullable(),
  codigoBarras: z.string().optional().nullable(),
  descricao: z.string().min(1),
  marca: z.string().optional().nullable(),
  unidadeIndividualId: uuidSchema,
  quantidadeIndividual: z.coerce.number().positive(),
  grupoMercadoriaId: uuidSchema.optional().nullable(),
  conversoes: z.array(cadastroProdutoConversaoPayloadSchema).default([])
});

export const cadastroUsuarioNovoColaboradorPayloadSchema = z.object({
  empresaId: uuidSchema,
  nome: z.string().min(1),
  cpf: z.string().optional().nullable(),
  setorId: uuidSchema.optional().nullable(),
  cargoId: uuidSchema
});

export const cadastroUsuarioPayloadSchema = z.object({
  empresaId: uuidSchema.optional(),
  empresaIds: z.array(uuidSchema).optional(),
  nome: z.string().min(1),
  email: z.string().email(),
  role: z.enum(rolesUsuario).optional(),
  colaboradorId: uuidSchema.optional(),
  novoColaborador: cadastroUsuarioNovoColaboradorPayloadSchema.optional(),
  senha: z.string().min(6).optional().or(z.literal(""))
});

export const tipoPermissaoCadastroSchema = z.enum(["cargo", "setor", "usuario"]);
export const regrasPermissoesSchema = z.partialRecord(z.enum(permissoes), z.boolean()).default({});

export const cadastroPermissaoPayloadSchema = z.object({
  tipoPermissao: tipoPermissaoCadastroSchema.default("cargo"),
  cargoId: uuidSchema.optional(),
  setorId: uuidSchema.optional().nullable(),
  usuarioId: z.string().min(1).optional(),
  regras: regrasPermissoesSchema
});

export const permissoesPaginadasQuerySchema = z.object({
  empresaId: uuidSchema.optional(),
  q: z.string().trim().optional().default(""),
  tipoPermissao: tipoPermissaoCadastroSchema.optional(),
  alvoId: z.string().trim().optional().default(""),
  permissao: z.enum(permissoes).optional()
}).merge(paginationQuerySchema);

export const excluirPermissaoQuerySchema = z.object({
  empresaId: uuidSchema.optional(),
  tipoPermissao: tipoPermissaoCadastroSchema,
  alvoId: z.string().min(1),
  permissao: z.enum(permissoes)
});

export function empresasDoBody(body: EntradaExterna): string[] {
  const dados = body as {
    empresaId?: EntradaExterna;
    empresaIds?: EntradaExterna;
    novoColaborador?: { empresaId?: EntradaExterna } | null;
  } | null;
  const ids = [
    ...(Array.isArray(dados?.empresaIds) ? dados.empresaIds : []),
    ...(dados?.empresaId ? [dados.empresaId] : []),
    ...(dados?.novoColaborador?.empresaId ? [dados.novoColaborador.empresaId] : [])
  ];
  return [
    ...new Set(ids.filter((id): id is string => typeof id === "string" && id.trim().length > 0).map((id) => id.trim()))
  ];
}

export type TipoCadastroParams = z.infer<typeof tipoCadastroParamsSchema>;
export type TipoCadastroComIdParams = z.infer<typeof tipoCadastroComIdParamsSchema>;
export type CadastroEmpresaPayload = z.infer<typeof cadastroEmpresaPayloadSchema>;
export type CadastroFornecedorPayload = z.infer<typeof cadastroFornecedorPayloadSchema>;
export type CadastroClientePayload = z.infer<typeof cadastroClientePayloadSchema>;
export type CadastroColaboradorPayload = z.infer<typeof cadastroColaboradorPayloadSchema>;
export type CadastroContaPayload = z.infer<typeof cadastroContaPayloadSchema>;
export type CadastroFormaPagamentoPayload = z.infer<typeof cadastroFormaPagamentoPayloadSchema>;
export type CadastroPdvPayload = z.infer<typeof cadastroPdvPayloadSchema>;
export type CadastroUnidadePayload = z.infer<typeof cadastroUnidadePayloadSchema>;
export type CadastroGrupoPayload = z.infer<typeof cadastroGrupoPayloadSchema>;
export type CadastroAreaPayload = z.infer<typeof cadastroAreaPayloadSchema>;
export type CadastroSetorPayload = z.infer<typeof cadastroSetorPayloadSchema>;
export type CadastroProdutoPayload = z.infer<typeof cadastroProdutoPayloadSchema>;
export type CadastroProdutoConversaoPayload = z.infer<typeof cadastroProdutoConversaoPayloadSchema>;
export type CadastroUsuarioPayload = z.infer<typeof cadastroUsuarioPayloadSchema>;
export type CadastroUsuarioNovoColaboradorPayload = z.infer<typeof cadastroUsuarioNovoColaboradorPayloadSchema>;
export type CadastroPermissaoPayload = z.infer<typeof cadastroPermissaoPayloadSchema>;
export type PermissoesPaginadasQuery = z.infer<typeof permissoesPaginadasQuerySchema>;
export type ExcluirPermissaoQuery = z.infer<typeof excluirPermissaoQuerySchema>;
export type TipoGrupoCadastro = z.infer<typeof tipoGrupoCadastroSchema>;
