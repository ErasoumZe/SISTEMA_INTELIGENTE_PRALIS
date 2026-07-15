import { and, asc, eq, inArray } from "drizzle-orm";
import { turnos } from "@padaria/db/schema/cadastro";
import type { TurnoDto } from "@padaria/shared/turnos";
import { banco, type ExecutorBanco } from "../banco/conexao.js";

export async function listarTurnosRepository(escopoEmpresas: string[]): Promise<TurnoDto[]> {
  return banco
    .select({
      id: turnos.id,
      empresaId: turnos.empresaId,
      nome: turnos.nome,
      horaInicio: turnos.horaInicio,
      horaFim: turnos.horaFim,
      ativo: turnos.ativo
    })
    .from(turnos)
    .where(inArray(turnos.empresaId, escopoEmpresas))
    .orderBy(asc(turnos.horaInicio), asc(turnos.nome));
}

export async function salvarTurnoRepository(
  input: { id?: string; empresaId: string; nome: string; horaInicio: string; horaFim: string; ativo: boolean },
  db: ExecutorBanco = banco
): Promise<{ id: string }> {
  if (input.id) {
    await db
      .update(turnos)
      .set({
        nome: input.nome,
        horaInicio: input.horaInicio,
        horaFim: input.horaFim,
        ativo: input.ativo,
        atualizadoEm: new Date()
      })
      .where(and(eq(turnos.id, input.id), eq(turnos.empresaId, input.empresaId)));
    return { id: input.id };
  }
  const [criado] = await db
    .insert(turnos)
    .values({
      empresaId: input.empresaId,
      nome: input.nome,
      horaInicio: input.horaInicio,
      horaFim: input.horaFim,
      ativo: input.ativo
    })
    .returning({ id: turnos.id });
  if (!criado) throw new Error("Turno nao criado");
  return criado;
}

export async function excluirTurnoRepository(id: string, empresaId: string, db: ExecutorBanco = banco): Promise<void> {
  // FK onDelete: set null em fechamentos_caixa.turno_id e colaboradores.turno_padrao_id.
  await db.delete(turnos).where(and(eq(turnos.id, id), eq(turnos.empresaId, empresaId)));
}
