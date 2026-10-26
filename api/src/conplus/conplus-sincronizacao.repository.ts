import { and, eq } from "drizzle-orm";
import { conplusSincronizacaoEstado } from "@padaria/db/schema";
import type { ConplusTipoRelatorio } from "@padaria/shared/conplus";
import { banco, type TransacaoBanco } from "../banco/conexao.js";

/** Persistência do estado da busca automática Conplus (uma linha por empresa + tipo). */

export type EstadoSincronizacaoConplus = typeof conplusSincronizacaoEstado.$inferSelect;
type AlteracaoEstado = Partial<Omit<EstadoSincronizacaoConplus, "id" | "empresaId" | "tipo" | "criadoEm">>;

export function listarEstadosSincronizacaoRepository(empresaId: string) {
  return banco.select().from(conplusSincronizacaoEstado).where(eq(conplusSincronizacaoEstado.empresaId, empresaId));
}

/** Garante a linha (idempotente) e a devolve travada para a transação decidir. */
export async function travarEstadoSincronizacaoRepository(
  tx: TransacaoBanco,
  empresaId: string,
  tipo: ConplusTipoRelatorio
): Promise<EstadoSincronizacaoConplus> {
  await tx.insert(conplusSincronizacaoEstado).values({ empresaId, tipo }).onConflictDoNothing();
  const [linha] = await tx
    .select()
    .from(conplusSincronizacaoEstado)
    .where(and(eq(conplusSincronizacaoEstado.empresaId, empresaId), eq(conplusSincronizacaoEstado.tipo, tipo)))
    .limit(1)
    .for("update");
  if (!linha) throw new Error("Estado da sincronização Conplus não pôde ser criado");
  return linha;
}

export async function travarEstadoPorBloqueioRepository(
  tx: TransacaoBanco,
  empresaId: string,
  tipo: ConplusTipoRelatorio,
  bloqueioToken: string
): Promise<EstadoSincronizacaoConplus | null> {
  const [linha] = await tx
    .select()
    .from(conplusSincronizacaoEstado)
    .where(
      and(
        eq(conplusSincronizacaoEstado.empresaId, empresaId),
        eq(conplusSincronizacaoEstado.tipo, tipo),
        eq(conplusSincronizacaoEstado.bloqueioToken, bloqueioToken)
      )
    )
    .limit(1)
    .for("update");
  return linha ?? null;
}

export async function alterarEstadoSincronizacaoRepository(
  tx: TransacaoBanco,
  id: string,
  alteracao: AlteracaoEstado
): Promise<EstadoSincronizacaoConplus> {
  const [linha] = await tx
    .update(conplusSincronizacaoEstado)
    .set(alteracao)
    .where(eq(conplusSincronizacaoEstado.id, id))
    .returning();
  if (!linha) throw new Error("Estado da sincronização Conplus desapareceu durante a atualização");
  return linha;
}
