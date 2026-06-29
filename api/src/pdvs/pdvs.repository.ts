import { and, asc, eq } from "drizzle-orm";
import { pdvs } from "@padaria/db/schema/cadastro";
import { banco, type ExecutorBanco } from "../banco/conexao.js";

export async function listarPdvsRepository() {
  return banco
    .select({
      id: pdvs.id,
      empresaId: pdvs.empresaId,
      nome: pdvs.nome,
      codigo: pdvs.codigo,
      contaId: pdvs.contaId,
      ativo: pdvs.ativo
    })
    .from(pdvs)
    .orderBy(asc(pdvs.nome));
}

export async function salvarPdvRepository(
  input: { id?: string; empresaId: string; nome: string; contaId: string; ativo: boolean },
  db: ExecutorBanco = banco
) {
  if (input.id) {
    await db
      .update(pdvs)
      .set({
        nome: input.nome,
        contaId: input.contaId,
        ativo: input.ativo,
        atualizadoEm: new Date()
      })
      .where(and(eq(pdvs.id, input.id), eq(pdvs.empresaId, input.empresaId)));
    return input;
  }
  const [criado] = await db
    .insert(pdvs)
    .values({
      empresaId: input.empresaId,
      nome: input.nome,
      contaId: input.contaId,
      ativo: input.ativo
    })
    .returning({ id: pdvs.id });
  return criado;
}
