import { and, asc, eq } from "drizzle-orm";
import { pdvs } from "@padaria/db/schema/cadastro";
import { banco, type ExecutorBanco, type TransacaoBanco } from "../banco/conexao.js";

// S3 (R-164): a conta do PDV e o PIVO dos sete totais de transferencia. O `FOR UPDATE` aqui
// serializa a troca de conta com as aberturas em voo (o INSERT do caixa toma `FOR KEY SHARE`
// nesta linha, que conflita com `FOR UPDATE`) e da a base para recusar a troca sob caixa aberto.
// `TransacaoBanco` obrigatorio: lock fora de transacao evapora.
export async function travarPdvRepository(pdvId: string, empresaId: string, db: TransacaoBanco) {
  const [linha] = await db
    .select({ id: pdvs.id, contaId: pdvs.contaId })
    .from(pdvs)
    .where(and(eq(pdvs.id, pdvId), eq(pdvs.empresaId, empresaId)))
    .for("update");
  return linha ?? null;
}

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
