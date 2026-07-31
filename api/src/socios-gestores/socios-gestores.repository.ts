import { and, asc, eq } from "drizzle-orm";
import { sociosGestores } from "@padaria/db/schema/cadastro";
import { banco, type ExecutorBanco } from "../banco/conexao.js";

export function listarSociosGestoresRepository(db: ExecutorBanco = banco) {
  return db
    .select({
      id: sociosGestores.id,
      empresaId: sociosGestores.empresaId,
      nome: sociosGestores.nome,
      ativo: sociosGestores.ativo
    })
    .from(sociosGestores)
    .orderBy(asc(sociosGestores.nome));
}

export async function salvarSocioGestorRepository(
  input: { id?: string; empresaId: string; nome: string; ativo: boolean },
  db: ExecutorBanco = banco
) {
  if (input.id) {
    const [atualizado] = await db
      .update(sociosGestores)
      .set({ nome: input.nome, ativo: input.ativo })
      .where(and(eq(sociosGestores.id, input.id), eq(sociosGestores.empresaId, input.empresaId)))
      .returning({ id: sociosGestores.id });
    if (!atualizado) throw new Error("Registro nao encontrado");
    return atualizado;
  }
  const [criado] = await db.insert(sociosGestores).values(input).returning({ id: sociosGestores.id });
  if (!criado) throw new Error("Socio/gestor nao criado");
  return criado;
}
