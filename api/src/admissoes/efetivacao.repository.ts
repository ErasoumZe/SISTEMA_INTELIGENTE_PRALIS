import { and, desc, eq, max } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { coalescerSql, cpfNormalizadoSql } from "@padaria/db/schema/expressions";
import {
  admissoesProcessos,
  admissoesProcessosFicha,
  admissoesProcessosInternos,
  admissoesTestes
} from "@padaria/db/schema/admissoes";
import {
  colaboradores,
  colaboradoresEventos,
  colaboradoresVinculos,
  empresas,
  funcoesOperacionais
} from "@padaria/db/schema/cadastro";
import type { DiaSemana, EtiquetaTurno } from "@padaria/shared/turnos";
import type { TransacaoBanco } from "../banco/conexao.js";

const funcaoTeste = alias(funcoesOperacionais, "funcao_efetivacao_teste");
const funcaoProcesso = alias(funcoesOperacionais, "funcao_efetivacao_processo");

export async function obterDadosEfetivacaoRepository(processoId: string, empresaId: string, tx: TransacaoBanco) {
  const [linha] = await tx
    .select({
      processoId: admissoesProcessos.id,
      origem: admissoesProcessos.origem,
      status: admissoesProcessos.status,
      nomeCompleto: coalescerSql<string | null>(admissoesTestes.nomeCompleto, admissoesProcessos.nomeCompleto),
      cpf: coalescerSql<string | null>(admissoesTestes.cpf, admissoesProcessos.cpf),
      funcaoId: coalescerSql<string | null>(admissoesTestes.funcaoId, admissoesProcessos.funcaoId),
      funcaoNome: coalescerSql<string | null>(funcaoTeste.nome, funcaoProcesso.nome),
      funcaoCbo: coalescerSql<string | null>(funcaoTeste.cbo, funcaoProcesso.cbo),
      jornadaHorario: admissoesTestes.jornadaHorario,
      turnoId: admissoesProcessos.turnoId,
      turnoRotulo: admissoesProcessos.turnoRotulo,
      // A tabela de processos antecede o tipo compartilhado de turno. O CHECK
      // dela já restringe os valores; a projeção devolve o tipo do contrato.
      turnoEtiqueta: admissoesProcessos.turnoEtiqueta,
      turnoHoraInicio: admissoesProcessos.turnoHoraInicio,
      turnoHoraFim: admissoesProcessos.turnoHoraFim,
      turnoDiasSemana: admissoesProcessos.turnoDiasSemana,
      dataAdmissao: admissoesProcessosInternos.dataAdmissao,
      exameSituacao: admissoesProcessosInternos.exameSituacao,
      fichaSituacao: admissoesProcessosFicha.situacao
    })
    .from(admissoesProcessos)
    .leftJoin(admissoesTestes, eq(admissoesTestes.id, admissoesProcessos.testeId))
    .leftJoin(funcaoTeste, eq(funcaoTeste.id, admissoesTestes.funcaoId))
    .leftJoin(funcaoProcesso, eq(funcaoProcesso.id, admissoesProcessos.funcaoId))
    .innerJoin(
      admissoesProcessosInternos,
      and(
        eq(admissoesProcessosInternos.processoId, admissoesProcessos.id),
        eq(admissoesProcessosInternos.empresaId, admissoesProcessos.empresaId)
      )
    )
    .leftJoin(
      admissoesProcessosFicha,
      and(
        eq(admissoesProcessosFicha.processoId, admissoesProcessos.id),
        eq(admissoesProcessosFicha.empresaId, admissoesProcessos.empresaId)
      )
    )
    .where(and(eq(admissoesProcessos.id, processoId), eq(admissoesProcessos.empresaId, empresaId)))
    .limit(1);
  return linha ?? null;
}

export async function bloquearVinculoDoProcessoRepository(processoId: string, empresaId: string, tx: TransacaoBanco) {
  const [linha] = await tx
    .select({
      id: colaboradoresVinculos.id,
      colaboradorId: colaboradoresVinculos.colaboradorId,
      matricula: colaboradoresVinculos.matricula
    })
    .from(colaboradoresVinculos)
    .where(and(eq(colaboradoresVinculos.processoId, processoId), eq(colaboradoresVinculos.empresaId, empresaId)))
    .limit(1)
    .for("update");
  return linha ?? null;
}

export async function localizarColaboradoresPorCpfRepository(cpf: string, empresaId: string, tx: TransacaoBanco) {
  return tx
    .select({ id: colaboradores.id, nome: colaboradores.nome })
    .from(colaboradores)
    .where(and(eq(colaboradores.empresaId, empresaId), eq(cpfNormalizadoSql(colaboradores.cpf), cpf)))
    .for("update");
}

export async function bloquearVinculoAtivoRepository(colaboradorId: string, empresaId: string, tx: TransacaoBanco) {
  const [linha] = await tx
    .select({ id: colaboradoresVinculos.id, matricula: colaboradoresVinculos.matricula })
    .from(colaboradoresVinculos)
    .where(
      and(
        eq(colaboradoresVinculos.colaboradorId, colaboradorId),
        eq(colaboradoresVinculos.empresaId, empresaId),
        eq(colaboradoresVinculos.status, "ativo")
      )
    )
    .limit(1)
    .for("update");
  return linha ?? null;
}

/**
 * Cadastros anteriores à E7 ainda não têm vínculo histórico. Não podemos supor que estejam
 * desligados e criar uma recontratação sobre um funcionário potencialmente ativo. A conciliação
 * explícita desse legado será uma operação própria, depois do preflight autorizado.
 */
export async function bloquearVinculoMaisRecenteRepository(
  colaboradorId: string,
  empresaId: string,
  tx: TransacaoBanco
) {
  const [linha] = await tx
    .select({
      id: colaboradoresVinculos.id,
      status: colaboradoresVinculos.status,
      matricula: colaboradoresVinculos.matricula
    })
    .from(colaboradoresVinculos)
    .where(and(eq(colaboradoresVinculos.colaboradorId, colaboradorId), eq(colaboradoresVinculos.empresaId, empresaId)))
    .orderBy(desc(colaboradoresVinculos.numeroSequencial))
    .limit(1)
    .for("update");
  return linha ?? null;
}

export async function criarColaboradorPorEfetivacaoRepository(
  input: { empresaId: string; nome: string; cpf: string },
  tx: TransacaoBanco
) {
  const [linha] = await tx.insert(colaboradores).values(input).returning({ id: colaboradores.id });
  if (!linha) throw new Error("Colaborador nao criado");
  return linha;
}

export async function obterPrefixoEMaiorMatriculaRepository(empresaId: string, tx: TransacaoBanco) {
  const [empresa] = await tx
    .select({ matriculaPrefixo: empresas.matriculaPrefixo })
    .from(empresas)
    .where(eq(empresas.id, empresaId))
    .limit(1);
  const [ultimo] = await tx
    .select({ numero: max(colaboradoresVinculos.numeroSequencial) })
    .from(colaboradoresVinculos)
    .where(eq(colaboradoresVinculos.empresaId, empresaId));
  return { prefixo: empresa?.matriculaPrefixo ?? null, maiorNumero: ultimo?.numero ?? null };
}

export async function criarVinculoRepository(
  input: {
    empresaId: string;
    colaboradorId: string;
    processoId: string;
    numeroSequencial: number;
    matricula: string;
    admitidoEm: string;
    funcaoId: string;
    funcaoNome: string;
    funcaoCbo: string | null;
    turnoId: string | null;
    turnoRotulo: string | null;
    turnoEtiqueta: EtiquetaTurno | null;
    turnoHoraInicio: string | null;
    turnoHoraFim: string | null;
    turnoDiasSemana: DiaSemana[] | null;
    jornadaHorario: string | null;
    criadoPor: string;
  },
  tx: TransacaoBanco
) {
  const [linha] = await tx.insert(colaboradoresVinculos).values(input).returning({ id: colaboradoresVinculos.id });
  if (!linha) throw new Error("Vinculo nao criado");
  return linha;
}

export async function registrarEventoColaboradorRepository(
  input: {
    empresaId: string;
    colaboradorId: string;
    vinculoId: string;
    processoId: string;
    tipo: "efetivado" | "recontratado";
    atorUsuarioId: string;
  },
  tx: TransacaoBanco
) {
  await tx.insert(colaboradoresEventos).values({ ...input, camposAlterados: [] });
}
