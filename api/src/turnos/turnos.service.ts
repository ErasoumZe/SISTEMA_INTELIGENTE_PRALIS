import type { DadosExternos } from "@padaria/shared/api";
import { conflito } from "../erros.js";
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
    ativo: dados.ativo,
    // Repassa AUSENTE como ausente. Trocar por `?? null` aqui apagaria etiqueta e dias de todo turno
    // salvo por um cliente que nao conhece os campos — exatamente o que a decisao proibiu.
    ...(dados.etiqueta === undefined ? {} : { etiqueta: dados.etiqueta }),
    ...(dados.diasSemana === undefined ? {} : { diasSemana: dados.diasSemana })
  });
}

/**
 * O turno usado numa ADMISSAO nao se apaga: a FK `admissoes_processos_turno_empresa_fk` e
 * `on delete restrict` (migration 0037), e apagar levaria embora, em silencio, o que foi combinado
 * com uma pessoa.
 *
 * O banco so sabe recusar — quem traduz e este servico. Sem a traducao, o DP veria 500.
 *
 * A comparacao e pelo CODIGO do erro e pelo NOME da constraint, nunca pelo texto: mensagem do
 * Postgres muda entre versoes e locales. Mesma forma ja usada em `caixa.service.ts` para o 23505.
 */
const constraintTurnoEmUso = "admissoes_processos_turno_empresa_fk";

function ehTurnoEmUso(erro: Error): boolean {
  // A causa aninhada importa: o driver embrulha o erro dentro de `cause` quando passa pelo Drizzle.
  // Mesma forma de `ehViolacaoCaixaAbertoUnico`, em api/src/caixa/caixa.service.ts.
  const candidatos = [erro, erro.cause instanceof Error ? erro.cause : null];
  return candidatos.some((atual) => {
    if (!atual) return false;
    const detalhes = atual as Error & { code?: string; constraint?: string };
    return detalhes.code === "23503" && detalhes.constraint === constraintTurnoEmUso;
  });
}

export async function excluirTurno(id: string, empresaId: string) {
  try {
    await excluirTurnoRepository(id, empresaId);
  } catch (erro) {
    if (erro instanceof Error && ehTurnoEmUso(erro)) {
      throw conflito("Este turno esta em uso em processos de admissao e nao pode ser excluido.", "TURNO_EM_USO");
    }
    throw erro;
  }
}
