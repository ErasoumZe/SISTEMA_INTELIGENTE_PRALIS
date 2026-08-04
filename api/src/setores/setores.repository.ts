import { and, asc, eq } from "drizzle-orm";
import { setores } from "@padaria/db/schema/cadastro";
import { banco, type ExecutorBanco } from "../banco/conexao.js";

export async function listarSetoresRepository() {
  return banco
    .select({
      id: setores.id,
      empresaId: setores.empresaId,
      areaId: setores.areaId,
      setorPaiId: setores.setorPaiId,
      nome: setores.nome
    })
    .from(setores)
    .orderBy(asc(setores.nome));
}

export async function buscarSetorEmpresaRepository(setorId: string, db: ExecutorBanco = banco) {
  const [setor] = await db
    .select({ empresaId: setores.empresaId })
    .from(setores)
    .where(eq(setores.id, setorId))
    .limit(1);
  return setor ?? null;
}

export async function salvarSetorRepository(
  input: { id?: string; empresaId: string; nome: string; areaId: string | null; setorPaiId: string | null },
  db: ExecutorBanco = banco
) {
  if (input.id) {
    await db
      .update(setores)
      .set({ nome: input.nome, areaId: input.areaId, setorPaiId: input.setorPaiId })
      .where(and(eq(setores.id, input.id), eq(setores.empresaId, input.empresaId)));
    return input;
  }
  const [criado] = await db
    .insert(setores)
    .values({ empresaId: input.empresaId, nome: input.nome, areaId: input.areaId, setorPaiId: input.setorPaiId })
    .returning({ id: setores.id });
  return criado;
}
