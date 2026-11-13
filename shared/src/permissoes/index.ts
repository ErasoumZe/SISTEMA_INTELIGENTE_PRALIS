import { z } from "zod";
import { paginationQuerySchema } from "../api/index.js";
import { permissoes } from "../autenticacao/index.js";

export { empresaQuerySchema as permissoesQuerySchema } from "../api/index.js";

const uuidSchema = z.string().uuid();

export const tipoPermissaoSchema = z.enum(["cargo", "setor", "usuario"]);
// Códigos que deixaram de controlar uma ação podem continuar gravados em perfis antigos. Eles são
// descartados na leitura para que um cadastro legado não impeça a pessoa de acessar o sistema nem
// volte a exibir uma permissão sem efeito no editor.
const permissoesAtuais = new Set<string>(permissoes);
export const regrasPermissoesSchema = z
  .preprocess(
    (valor) => {
      if (!valor || typeof valor !== "object" || Array.isArray(valor)) return valor;
      return Object.fromEntries(Object.entries(valor).filter(([codigo]) => permissoesAtuais.has(codigo)));
    },
    z.partialRecord(z.enum(permissoes), z.boolean())
  )
  .default({});

export const permissaoPayloadSchema = z.object({
  tipoPermissao: tipoPermissaoSchema.default("cargo"),
  cargoId: uuidSchema.optional(),
  setorId: uuidSchema.optional().nullable(),
  usuarioId: z.string().min(1).optional(),
  regras: regrasPermissoesSchema
});

export const permissoesPaginadasQuerySchema = z
  .object({
    empresaId: uuidSchema.optional(),
    q: z.string().trim().optional().default(""),
    tipoPermissao: tipoPermissaoSchema.optional(),
    alvoId: z.string().trim().optional().default(""),
    permissao: z.enum(permissoes).optional()
  })
  .merge(paginationQuerySchema);

export const excluirPermissaoQuerySchema = z.object({
  empresaId: uuidSchema.optional(),
  tipoPermissao: tipoPermissaoSchema,
  alvoId: z.string().min(1),
  permissao: z.enum(permissoes)
});

export type TipoPermissao = z.infer<typeof tipoPermissaoSchema>;
export type PermissaoPayload = z.infer<typeof permissaoPayloadSchema>;
export type PermissoesPaginadasQuery = z.infer<typeof permissoesPaginadasQuerySchema>;
export type ExcluirPermissaoQuery = z.infer<typeof excluirPermissaoQuerySchema>;

// Cargos de acesso (Marco, 13/11/2026): a aba "Cargos" de Permissoes mostra os cargos da empresa,
// restaura o padrao de cada um, cria o cargo de referencia que falta (ex.: "Caixa Gerente") e troca o
// cargo das contas de posto do Caixa. So contas de posto: o cargo de quem e do DP continua no DP.
export const criarCargoPadraoPayloadSchema = z.object({
  empresaId: uuidSchema,
  nome: z.string().trim().min(1).max(80)
});

export const contaPostoEmpresaPayloadSchema = z.object({ empresaId: uuidSchema });

export const trocarCargoContaPostoPayloadSchema = z.object({
  empresaId: uuidSchema,
  cargoId: uuidSchema
});

export type CriarCargoPadraoPayload = z.infer<typeof criarCargoPadraoPayloadSchema>;
export type TrocarCargoContaPostoPayload = z.infer<typeof trocarCargoContaPostoPayloadSchema>;

export type CargoAcesso = {
  id: string;
  nome: string;
  temPadrao: boolean;
  permitidas: number;
  pessoas: number;
};

export type ContaPostoCargo = {
  usuarioId: string;
  nome: string;
  email: string;
  posto: string;
  cargoId: string | null;
  cargoNome: string | null;
  // Tem regras salvas em "Acessos por pessoa": elas passam por cima do cargo.
  acessoIndividual: boolean;
};

export type CargosAcessoResumo = {
  cargos: CargoAcesso[];
  padroesFaltando: string[];
  contasPosto: ContaPostoCargo[];
};
