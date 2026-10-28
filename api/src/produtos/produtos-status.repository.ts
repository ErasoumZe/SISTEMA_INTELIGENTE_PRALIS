import { and, eq, inArray } from "drizzle-orm";
import { produtos } from "@padaria/db/schema/cadastro";
import { banco } from "../banco/conexao.js";

/** Troca o status SO dos produtos da empresa informada; id de outra empresa simplesmente nao casa. */
export async function alterarStatusDeProdutosRepository(
  empresaId: string,
  ids: string[],
  status: "ativo" | "inativo"
): Promise<string[]> {
  const alterados = await banco
    .update(produtos)
    .set({ status })
    .where(and(eq(produtos.empresaId, empresaId), inArray(produtos.id, ids)))
    .returning({ id: produtos.id });
  return alterados.map((linha) => linha.id);
}
