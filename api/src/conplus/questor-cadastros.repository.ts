import { and, asc, eq, gte, lt } from "drizzle-orm";
import { funcoesOperacionais as funcoesQuestorTabela, turnos as turnosQuestorTabela } from "@padaria/db/schema";
import type { FuncaoQuestorPayload, TurnoQuestorPayload } from "@padaria/shared/conplus";
import { banco } from "../banco/conexao.js";

/**
 * E3 — vínculo Questor das funções e turnos. Só as colunas Questor são escritas; nome, CBO,
 * horário e situação continuam com as telas próprias de Funções e Turnos.
 *
 * Concorrência: as tabelas não têm `versao`; o UPDATE só acontece se `atualizado_em` ainda for o
 * lido — comparado na janela do milissegundo lido (o `Date` do driver não carrega microssegundos). `null` no retorno = registro inexistente nesta empresa OU alterado depois da leitura — o
 * serviço distingue os dois com `existe*`.
 */

/** `atualizado_em` dentro do milissegundo lido: [lido, lido + 1 ms). */
function mesmoInstante(
  coluna: typeof funcoesQuestorTabela.atualizadoEm | typeof turnosQuestorTabela.atualizadoEm,
  lido: string
) {
  const inicio = new Date(lido);
  return [gte(coluna, inicio), lt(coluna, new Date(inicio.getTime() + 1))];
}

const colunasFuncao = {
  id: funcoesQuestorTabela.id,
  nome: funcoesQuestorTabela.nome,
  cbo: funcoesQuestorTabela.cbo,
  ativo: funcoesQuestorTabela.ativo,
  questorCodigoCargo: funcoesQuestorTabela.questorCodigoCargo,
  questorAgenteNocivo: funcoesQuestorTabela.questorAgenteNocivo,
  atualizadoEm: funcoesQuestorTabela.atualizadoEm
};

const colunasTurno = {
  id: turnosQuestorTabela.id,
  nome: turnosQuestorTabela.nome,
  ativo: turnosQuestorTabela.ativo,
  questorCodigoEscala: turnosQuestorTabela.questorCodigoEscala,
  questorTipoJornada: turnosQuestorTabela.questorTipoJornada,
  questorTempoParcial: turnosQuestorTabela.questorTempoParcial,
  questorRegimeJornada: turnosQuestorTabela.questorRegimeJornada,
  atualizadoEm: turnosQuestorTabela.atualizadoEm
};

export async function listarFuncoesQuestorRepository(empresaId: string) {
  return banco
    .select(colunasFuncao)
    .from(funcoesQuestorTabela)
    .where(eq(funcoesQuestorTabela.empresaId, empresaId))
    .orderBy(asc(funcoesQuestorTabela.nome));
}

export async function obterFuncaoQuestorRepository(empresaId: string, id: string) {
  const [linha] = await banco
    .select(colunasFuncao)
    .from(funcoesQuestorTabela)
    .where(and(eq(funcoesQuestorTabela.id, id), eq(funcoesQuestorTabela.empresaId, empresaId)))
    .limit(1);
  return linha ?? null;
}

export async function atualizarFuncaoQuestorRepository(
  empresaId: string,
  id: string,
  atualizadoEmLido: string,
  dados: FuncaoQuestorPayload
) {
  const [linha] = await banco
    .update(funcoesQuestorTabela)
    .set(dados)
    .where(
      and(
        eq(funcoesQuestorTabela.id, id),
        eq(funcoesQuestorTabela.empresaId, empresaId),
        ...mesmoInstante(funcoesQuestorTabela.atualizadoEm, atualizadoEmLido)
      )
    )
    .returning(colunasFuncao);
  return linha ?? null;
}

export async function listarTurnosQuestorRepository(empresaId: string) {
  return banco
    .select(colunasTurno)
    .from(turnosQuestorTabela)
    .where(eq(turnosQuestorTabela.empresaId, empresaId))
    .orderBy(asc(turnosQuestorTabela.nome));
}

export async function obterTurnoQuestorRepository(empresaId: string, id: string) {
  const [linha] = await banco
    .select(colunasTurno)
    .from(turnosQuestorTabela)
    .where(and(eq(turnosQuestorTabela.id, id), eq(turnosQuestorTabela.empresaId, empresaId)))
    .limit(1);
  return linha ?? null;
}

export async function atualizarTurnoQuestorRepository(
  empresaId: string,
  id: string,
  atualizadoEmLido: string,
  dados: TurnoQuestorPayload
) {
  const [linha] = await banco
    .update(turnosQuestorTabela)
    .set(dados)
    .where(
      and(
        eq(turnosQuestorTabela.id, id),
        eq(turnosQuestorTabela.empresaId, empresaId),
        ...mesmoInstante(turnosQuestorTabela.atualizadoEm, atualizadoEmLido)
      )
    )
    .returning(colunasTurno);
  return linha ?? null;
}
