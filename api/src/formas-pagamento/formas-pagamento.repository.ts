import { and, asc, eq } from "drizzle-orm";
import { formasPagamento } from "@padaria/db/schema/cadastro";
import { banco, type ExecutorBanco } from "../banco/conexao.js";

export async function listarFormasPagamentoRepository() {
  return banco
    .select({ id: formasPagamento.id, empresaId: formasPagamento.empresaId, nome: formasPagamento.nome })
    .from(formasPagamento)
    .orderBy(asc(formasPagamento.nome));
}

export async function salvarFormaPagamentoRepository(
  input: { id?: string; empresaId: string; nome: string },
  db: ExecutorBanco = banco
) {
  if (input.id) {
    await db
      .update(formasPagamento)
      .set({ nome: input.nome, atualizadoEm: new Date() })
      .where(and(eq(formasPagamento.id, input.id), eq(formasPagamento.empresaId, input.empresaId)));
    return { id: input.id, empresaId: input.empresaId, nome: input.nome };
  }
  const [criada] = await db
    .insert(formasPagamento)
    .values({ empresaId: input.empresaId, nome: input.nome })
    .returning({ id: formasPagamento.id });
  return criada;
}
