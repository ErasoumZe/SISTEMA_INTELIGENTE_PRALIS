import type { DadosExternos } from "@padaria/shared/api";
import { turnoPayloadSchema } from "@padaria/shared/turnos";
import { excluirTurnoRepository, listarTurnosRepository, salvarTurnoRepository } from "./turnos.repository.js";

export async function listarTurnos(escopoDados: string[]) {
  if (!escopoDados.length) return [];
  return listarTurnosRepository(escopoDados);
}

export async function salvarTurno(id: string | null, body: DadosExternos) {
  const dados = turnoPayloadSchema.parse(body);
  if (dados.horaInicio >= dados.horaFim) throw new Error("Hora de inicio deve ser menor que a de fim");
  return salvarTurnoRepository({
    ...(id ? { id } : {}),
    empresaId: dados.empresaId,
    nome: dados.nome.trim(),
    horaInicio: dados.horaInicio,
    horaFim: dados.horaFim,
    ativo: dados.ativo
  });
}

export async function excluirTurno(id: string, empresaId: string) {
  await excluirTurnoRepository(id, empresaId);
}
