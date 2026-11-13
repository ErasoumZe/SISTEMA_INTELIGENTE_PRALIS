import { and, asc, eq, inArray } from "drizzle-orm";
import { produtos } from "@padaria/db/schema/cadastro";
import { banco, type ExecutorBanco, type TransacaoBanco } from "../banco/conexao.js";

/** Produtos de revenda ATIVOS da empresa que ainda não estão liberados para compra (13/11/2026). */
function condicaoRevendaAtivaNaoLiberada(empresaId: string) {
  return and(
    eq(produtos.empresaId, empresaId),
    eq(produtos.status, "ativo"),
    eq(produtos.tipo, "revenda"),
    eq(produtos.liberadoCompra, false)
  );
}

export async function revendaAtivaNaoLiberadaRepository(empresaId: string, tx: ExecutorBanco = banco) {
  return tx
    .select({ id: produtos.id, codigoInterno: produtos.codigoInterno, descricao: produtos.descricao })
    .from(produtos)
    .where(condicaoRevendaAtivaNaoLiberada(empresaId))
    .orderBy(asc(produtos.descricao), asc(produtos.id));
}

/** Liga a liberação só nos IDs da prévia que continuam revenda, ativos e desligados. */
export async function liberarRevendaRepository(tx: TransacaoBanco, empresaId: string, ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  const liberados = await tx
    .update(produtos)
    .set({ liberadoCompra: true, atualizadoEm: new Date() })
    .where(and(condicaoRevendaAtivaNaoLiberada(empresaId), inArray(produtos.id, ids)))
    .returning({ id: produtos.id });
  return liberados.length;
}
