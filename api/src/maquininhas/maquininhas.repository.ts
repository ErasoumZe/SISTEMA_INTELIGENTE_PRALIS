import { and, asc, eq, inArray } from "drizzle-orm";
import { maquininhas } from "@padaria/db/schema/cadastro";
import { banco, type ExecutorBanco } from "../banco/conexao.js";

export async function listarMaquininhasRepository(empresaIds: string[], db: ExecutorBanco = banco) {
  if (empresaIds.length === 0) return [];
  return db
    .select({
      id: maquininhas.id,
      empresaId: maquininhas.empresaId,
      numeroSerie: maquininhas.numeroSerie,
      apelido: maquininhas.apelido,
      ativo: maquininhas.ativo
    })
    .from(maquininhas)
    .where(inArray(maquininhas.empresaId, empresaIds))
    .orderBy(asc(maquininhas.apelido));
}

export async function salvarMaquininhaRepository(
  input: { id?: string; empresaId: string; numeroSerie: string; apelido: string; ativo: boolean },
  db: ExecutorBanco = banco
) {
  if (input.id) {
    const [item] = await db
      .update(maquininhas)
      .set({ numeroSerie: input.numeroSerie, apelido: input.apelido, ativo: input.ativo, atualizadoEm: new Date() })
      .where(and(eq(maquininhas.id, input.id), eq(maquininhas.empresaId, input.empresaId)))
      .returning({ id: maquininhas.id });
    if (!item) throw new Error("Maquininha nao encontrada");
    return item;
  }
  const [item] = await db.insert(maquininhas).values(input).returning({ id: maquininhas.id });
  if (!item) throw new Error("Maquininha nao criada");
  return item;
}
