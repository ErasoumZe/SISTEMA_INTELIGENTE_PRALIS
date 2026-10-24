import { and, asc, eq, gte, lt } from "drizzle-orm";
import { colaboradores, colaboradoresVinculos } from "@padaria/db/schema";
import type { ContratoColaboradorQuestorPayload } from "@padaria/shared/conplus";
import { banco } from "../banco/conexao.js";

/**
 * Código do contrato Questor no vínculo do colaborador. Só a coluna Questor é escrita; o resto do
 * vínculo continua com a efetivação e o desligamento.
 *
 * Concorrência: o vínculo não tem `versao`; o UPDATE só acontece se `atualizado_em` ainda for o lido,
 * comparado na janela do milissegundo lido (o `Date` do driver não carrega microssegundos). `null` no
 * retorno = vínculo inexistente nesta empresa OU alterado depois da leitura.
 */

const colunas = {
  vinculoId: colaboradoresVinculos.id,
  matricula: colaboradoresVinculos.matricula,
  colaboradorNome: colaboradores.nome,
  funcaoNome: colaboradoresVinculos.funcaoNome,
  admitidoEm: colaboradoresVinculos.admitidoEm,
  status: colaboradoresVinculos.status,
  questorCodigoContrato: colaboradoresVinculos.questorCodigoContrato,
  atualizadoEm: colaboradoresVinculos.atualizadoEm
};

function consultaBase() {
  return banco
    .select(colunas)
    .from(colaboradoresVinculos)
    .innerJoin(
      colaboradores,
      and(
        eq(colaboradores.id, colaboradoresVinculos.colaboradorId),
        eq(colaboradores.empresaId, colaboradoresVinculos.empresaId)
      )
    );
}

export async function listarContratosColaboradoresQuestorRepository(empresaId: string) {
  return consultaBase()
    .where(eq(colaboradoresVinculos.empresaId, empresaId))
    .orderBy(asc(colaboradoresVinculos.status), asc(colaboradores.nome), asc(colaboradoresVinculos.matricula));
}

export async function obterContratoColaboradorQuestorRepository(empresaId: string, vinculoId: string) {
  const [linha] = await consultaBase()
    .where(and(eq(colaboradoresVinculos.id, vinculoId), eq(colaboradoresVinculos.empresaId, empresaId)))
    .limit(1);
  return linha ?? null;
}

export async function atualizarContratoColaboradorQuestorRepository(
  empresaId: string,
  vinculoId: string,
  atualizadoEmLido: string,
  dados: ContratoColaboradorQuestorPayload
) {
  const inicio = new Date(atualizadoEmLido);
  const [linha] = await banco
    .update(colaboradoresVinculos)
    .set({ questorCodigoContrato: dados.questorCodigoContrato })
    .where(
      and(
        eq(colaboradoresVinculos.id, vinculoId),
        eq(colaboradoresVinculos.empresaId, empresaId),
        gte(colaboradoresVinculos.atualizadoEm, inicio),
        lt(colaboradoresVinculos.atualizadoEm, new Date(inicio.getTime() + 1))
      )
    )
    .returning({ id: colaboradoresVinculos.id });
  return linha ?? null;
}
