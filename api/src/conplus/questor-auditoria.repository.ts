import { and, desc, eq } from "drizzle-orm";
import { questorAuditoria } from "@padaria/db/schema";
import { banco, type TransacaoBanco } from "../banco/conexao.js";

/**
 * Trilha de auditoria Questor (migration 0079): downloads, tentativas recusadas e cancelamentos. Só
 * inserção — nada aqui é editado ou apagado.
 */

export type AcaoAuditoriaQuestor = "download" | "recusa_homologacao" | "recusa_catalogo" | "cancelamento_lancamento";

export async function registrarAuditoriaQuestorRepository(
  dados: {
    empresaId: string;
    usuarioId: string;
    acao: AcaoAuditoriaQuestor;
    exportacaoId?: string | null;
    detalhes?: Record<string, string | number | boolean | null>;
  },
  executor: TransacaoBanco | typeof banco = banco
) {
  await executor.insert(questorAuditoria).values({
    empresaId: dados.empresaId,
    usuarioId: dados.usuarioId,
    acao: dados.acao,
    exportacaoId: dados.exportacaoId ?? null,
    detalhes: dados.detalhes ?? {}
  });
}

export function listarAuditoriaQuestorRepository(empresaId: string, acao?: AcaoAuditoriaQuestor, limite = 50) {
  const condicoes = [eq(questorAuditoria.empresaId, empresaId)];
  if (acao) condicoes.push(eq(questorAuditoria.acao, acao));
  return banco
    .select()
    .from(questorAuditoria)
    .where(and(...condicoes))
    .orderBy(desc(questorAuditoria.criadoEm))
    .limit(limite);
}
