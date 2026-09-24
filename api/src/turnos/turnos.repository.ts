import { and, asc, eq, inArray } from "drizzle-orm";
import { turnos } from "@padaria/db/schema/cadastro";
import type { DiaSemana, EtiquetaTurno, TurnoDto } from "@padaria/shared/turnos";
import { banco, type ExecutorBanco } from "../banco/conexao.js";

export async function listarTurnosRepository(escopoEmpresas: string[]): Promise<TurnoDto[]> {
  return banco
    .select({
      id: turnos.id,
      empresaId: turnos.empresaId,
      nome: turnos.nome,
      horaInicio: turnos.horaInicio,
      horaFim: turnos.horaFim,
      ativo: turnos.ativo,
      etiqueta: turnos.etiqueta,
      diasSemana: turnos.diasSemana
    })
    .from(turnos)
    .where(inArray(turnos.empresaId, escopoEmpresas))
    .orderBy(asc(turnos.horaInicio), asc(turnos.nome));
}

export type TurnoEscrita = {
  id?: string;
  empresaId: string;
  nome: string;
  horaInicio: string;
  horaFim: string;
  ativo: boolean;
  /**
   * AUSENTE e NULO sao diferentes: `undefined` NAO MEXE no que esta gravado, `null` LIMPA.
   *
   * Sem essa distincao, um cliente que nao conhece os campos novos apagaria etiqueta e dias ao salvar
   * qualquer outra coisa do turno — e "sem alterar automaticamente valores existentes" viraria
   * intencao, nao garantia.
   */
  etiqueta?: EtiquetaTurno | null;
  diasSemana?: DiaSemana[] | null;
};

export async function salvarTurnoRepository(input: TurnoEscrita, db: ExecutorBanco = banco): Promise<{ id: string }> {
  if (input.id) {
    await db
      .update(turnos)
      .set({
        nome: input.nome,
        horaInicio: input.horaInicio,
        horaFim: input.horaFim,
        ativo: input.ativo,
        // Espalhados condicionalmente: a chave nem existe no objeto quando o campo veio ausente,
        // entao o Drizzle nao a inclui no SET e o valor gravado sobrevive.
        ...(input.etiqueta === undefined ? {} : { etiqueta: input.etiqueta }),
        ...(input.diasSemana === undefined ? {} : { diasSemana: input.diasSemana }),
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
      ativo: input.ativo,
      etiqueta: input.etiqueta ?? null,
      diasSemana: input.diasSemana ?? null
    })
    .returning({ id: turnos.id });
  if (!criado) throw new Error("Turno nao criado");
  return criado;
}

export async function excluirTurnoRepository(id: string, empresaId: string, db: ExecutorBanco = banco): Promise<void> {
  // FK onDelete: set null em fechamentos_caixa.turno_id e colaboradores.turno_padrao_id.
  await db.delete(turnos).where(and(eq(turnos.id, id), eq(turnos.empresaId, empresaId)));
}
