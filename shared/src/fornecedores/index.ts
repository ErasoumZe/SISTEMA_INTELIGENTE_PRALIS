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

export const situacoesFornecedor = ["ativo", "inativo"] as const;
export type SituacaoFornecedor = (typeof situacoesFornecedor)[number];

export const fornecedorPayloadSchema = z.object({
  empresaId: uuidSchema,
  nome: z.string().min(1),
  documento: z.string().optional().nullable(),
  // R-219/R-221: fornecedor inativo nao aparece no seletor da rodada. WhatsApp segue opcional no
  // cadastro; a obrigatoriedade e no ato de convidar (ver `podeConvidar`).
  situacao: z.enum(situacoesFornecedor).default("ativo"),
  whatsapp: z.string().trim().min(8).max(30).optional().nullable(),
  // Doc 59 (Rodrigo, 29/10/2026): texto livre ate a lista de categorias ser definida.
  categoria: z.string().trim().max(80).optional().nullable()
});

/**
 * Por que o fornecedor NAO pode ser convidado para uma rodada, ou `null` se pode (R-219/R-221).
 *
 * A obrigatoriedade do WhatsApp vive aqui, no ato de convidar, e nao no cadastro: ha fornecedor
 * historico sem telefone, e a tela mostra o fornecedor no seletor mas bloqueia o convite nomeando o
 * campo que falta. Fornecedor inativo nem deveria aparecer no seletor, mas a checagem existe como
 * segunda tranca.
 */
export function podeConvidar(fornecedor: {
  situacao?: SituacaoFornecedor | null;
  whatsapp?: string | null;
}): string | null {
  if (fornecedor.situacao === "inativo") return "Fornecedor inativo";
  const digitos = (fornecedor.whatsapp ?? "").replace(/\D/g, "");
  if (digitos.length < 10) return "WhatsApp valido (com DDD)";
  return null;
}

export const fornecedoresQuerySchema = empresaQuerySchema;
export const importarFornecedoresSchema = importarEmpresaPayloadSchema;
export const exportarFornecedorSchema = exportarEmpresaPayloadSchema;
export const fornecedorParamsSchema = apiIdParamsSchema;

export type FornecedorPayload = z.infer<typeof fornecedorPayloadSchema>;
export type ImportarFornecedoresPayload = ImportarEmpresaPayload;
export type ExportarFornecedorPayload = ExportarEmpresaPayload;
