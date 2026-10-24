import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import {
  colaboradores,
  colaboradoresVinculos,
  questorConfiguracoes,
  questorEventosVariaveis,
  questorEventosVariaveisLancamentos,
  questorExportacoesEventosVariaveis
} from "@padaria/db/schema";
import { banco, type TransacaoBanco } from "../banco/conexao.js";

export function listarEventosVariaveisRepository(empresaId: string) {
  return banco
    .select()
    .from(questorEventosVariaveis)
    .where(eq(questorEventosVariaveis.empresaId, empresaId))
    .orderBy(asc(questorEventosVariaveis.codigo));
}

export function inserirEventoVariavelRepository(
  empresaId: string,
  dados: { codigo: string; descricao: string; unidades: string[]; criadoPor: string }
) {
  return banco
    .insert(questorEventosVariaveis)
    .values({ empresaId, ...dados })
    .onConflictDoNothing()
    .returning();
}

export async function atualizarEventoVariavelRepository(
  empresaId: string,
  id: string,
  dados: { descricao?: string; ativo?: boolean }
) {
  const [linha] = await banco
    .update(questorEventosVariaveis)
    .set({ ...dados, atualizadoEm: new Date() })
    .where(and(eq(questorEventosVariaveis.id, id), eq(questorEventosVariaveis.empresaId, empresaId)))
    .returning();
  return linha ?? null;
}

export async function inserirLancamentoVariavelRepository(
  empresaId: string,
  dados: {
    competencia: string;
    vinculoId: string;
    eventoId: string;
    unidade: "H" | "R" | "V";
    valor: string;
    criadoPor: string;
  }
) {
  const [vinculo] = await banco
    .select({ id: colaboradoresVinculos.id })
    .from(colaboradoresVinculos)
    .where(and(eq(colaboradoresVinculos.id, dados.vinculoId), eq(colaboradoresVinculos.empresaId, empresaId)))
    .limit(1);
  if (!vinculo) return { kind: "vinculo_inexistente" as const };

  const [evento] = await banco
    .select({
      id: questorEventosVariaveis.id,
      unidades: questorEventosVariaveis.unidades,
      ativo: questorEventosVariaveis.ativo
    })
    .from(questorEventosVariaveis)
    .where(and(eq(questorEventosVariaveis.id, dados.eventoId), eq(questorEventosVariaveis.empresaId, empresaId)))
    .limit(1);
  if (!evento) return { kind: "evento_inexistente" as const };
  if (!evento.ativo) return { kind: "evento_inativo" as const };
  if (!evento.unidades.includes(dados.unidade)) return { kind: "unidade_nao_catalogada" as const };

  const [linha] = await banco
    .insert(questorEventosVariaveisLancamentos)
    .values({ empresaId, ...dados })
    .onConflictDoNothing()
    .returning({ id: questorEventosVariaveisLancamentos.id });
  return linha ? { kind: "criado" as const, id: linha.id } : { kind: "duplicado" as const };
}

/**
 * Remove um lançamento que ainda não saiu em arquivo. Lançamento exportado fica: a FK da auditoria
 * (`ON DELETE RESTRICT`) também impede, mas o serviço responde antes com mensagem clara.
 */
export async function removerLancamentoVariavelRepository(empresaId: string, id: string) {
  const [removido] = await banco
    .delete(questorEventosVariaveisLancamentos)
    .where(
      and(eq(questorEventosVariaveisLancamentos.id, id), eq(questorEventosVariaveisLancamentos.empresaId, empresaId))
    )
    .returning({ id: questorEventosVariaveisLancamentos.id });
  return removido ?? null;
}

/** Lançamento + vínculo + colaborador + evento: tudo que o CSV e a tela precisam. */
function consultaLancamentos() {
  return banco
    .select({
      id: questorEventosVariaveisLancamentos.id,
      competencia: questorEventosVariaveisLancamentos.competencia,
      vinculoId: questorEventosVariaveisLancamentos.vinculoId,
      colaboradorNome: colaboradores.nome,
      matricula: colaboradoresVinculos.matricula,
      questorCodigoContrato: colaboradoresVinculos.questorCodigoContrato,
      eventoId: questorEventosVariaveisLancamentos.eventoId,
      eventoCodigo: questorEventosVariaveis.codigo,
      eventoDescricao: questorEventosVariaveis.descricao,
      eventoAtivo: questorEventosVariaveis.ativo,
      eventoUnidades: questorEventosVariaveis.unidades,
      unidade: questorEventosVariaveisLancamentos.unidade,
      valor: questorEventosVariaveisLancamentos.valor
    })
    .from(questorEventosVariaveisLancamentos)
    .innerJoin(
      colaboradoresVinculos,
      and(
        eq(colaboradoresVinculos.id, questorEventosVariaveisLancamentos.vinculoId),
        eq(colaboradoresVinculos.empresaId, questorEventosVariaveisLancamentos.empresaId)
      )
    )
    .innerJoin(
      colaboradores,
      and(
        eq(colaboradores.id, colaboradoresVinculos.colaboradorId),
        eq(colaboradores.empresaId, colaboradoresVinculos.empresaId)
      )
    )
    .innerJoin(
      questorEventosVariaveis,
      and(
        eq(questorEventosVariaveis.id, questorEventosVariaveisLancamentos.eventoId),
        eq(questorEventosVariaveis.empresaId, questorEventosVariaveisLancamentos.empresaId)
      )
    );
}

export type LancamentoVariavelCompleto = Awaited<ReturnType<typeof buscarLancamentosVariaveisRepository>>[number];

export function buscarLancamentosVariaveisRepository(empresaId: string, ids: readonly string[]) {
  return consultaLancamentos().where(
    and(
      eq(questorEventosVariaveisLancamentos.empresaId, empresaId),
      inArray(questorEventosVariaveisLancamentos.id, [...ids]),
      // Cancelado não entra em arquivo nem na tela.
      isNull(questorEventosVariaveisLancamentos.canceladoEm)
    )
  );
}

export function listarLancamentosVariaveisRepository(empresaId: string, competencia?: string) {
  const condicoes = [
    eq(questorEventosVariaveisLancamentos.empresaId, empresaId),
    isNull(questorEventosVariaveisLancamentos.canceladoEm)
  ];
  if (competencia) condicoes.push(eq(questorEventosVariaveisLancamentos.competencia, competencia));
  return consultaLancamentos()
    .where(and(...condicoes))
    .orderBy(
      asc(questorEventosVariaveisLancamentos.competencia),
      asc(colaboradores.nome),
      asc(questorEventosVariaveis.codigo)
    );
}

/** Ids da lista que aparecem em QUALQUER arquivo gravado (técnico ou oficial) — não podem ser apagados. */
export async function lancamentosComArquivoRepository(empresaId: string, ids: readonly string[]) {
  if (!ids.length) return [];
  const linhas = await banco
    .selectDistinct({ lancamentoId: questorExportacoesEventosVariaveis.lancamentoId })
    .from(questorExportacoesEventosVariaveis)
    .where(
      and(
        eq(questorExportacoesEventosVariaveis.empresaId, empresaId),
        inArray(questorExportacoesEventosVariaveis.lancamentoId, [...ids])
      )
    );
  return linhas.map((linha) => linha.lancamentoId);
}

/** Configuração da empresa usada no arquivo: código no Questor (coluna 2) e hora centesimal. */
export async function lerParametrosEventosRepository(empresaId: string) {
  const [linha] = await banco
    .select({
      utilizaHoraCentesimal: questorConfiguracoes.utilizaHoraCentesimal,
      codigoEmpresaQuestor: questorConfiguracoes.codigoEmpresaQuestor,
      razaoSocialQuestor: questorConfiguracoes.razaoSocialQuestor
    })
    .from(questorConfiguracoes)
    .where(eq(questorConfiguracoes.empresaId, empresaId))
    .limit(1);
  return {
    utilizaHoraCentesimal: linha?.utilizaHoraCentesimal ?? null,
    codigoEmpresaQuestor: linha?.codigoEmpresaQuestor ?? null,
    razaoSocialQuestor: linha?.razaoSocialQuestor ?? null
  };
}

/** Catálogo da empresa por código (para conferir a importação do catálogo oficial). */
export function catalogoPorCodigosRepository(empresaId: string, codigos: readonly string[]) {
  if (!codigos.length) return Promise.resolve([]);
  return banco
    .select()
    .from(questorEventosVariaveis)
    .where(
      and(eq(questorEventosVariaveis.empresaId, empresaId), inArray(questorEventosVariaveis.codigo, [...codigos]))
    );
}

/** Grava eventos novos do catálogo oficial; código que já existe fica como está (ON CONFLICT DO NOTHING). */
export function inserirEventosCatalogoRepository(
  empresaId: string,
  criadoPor: string,
  eventos: ReadonlyArray<{
    codigo: string;
    descricao: string;
    unidade: "H" | "R" | "V";
    natureza: "Provento" | "Desconto";
    sequencia: number;
    filial: number;
  }>
) {
  if (!eventos.length) return Promise.resolve([]);
  return banco
    .insert(questorEventosVariaveis)
    .values(
      eventos.map((evento) => ({
        empresaId,
        criadoPor,
        codigo: evento.codigo,
        descricao: evento.descricao,
        unidades: [evento.unidade],
        natureza: evento.natureza,
        sequenciaQuestor: evento.sequencia,
        filialQuestor: evento.filial
      }))
    )
    .onConflictDoNothing()
    .returning({ id: questorEventosVariaveis.id });
}

/**
 * Cancelamento lógico (só o que não está cancelado). `null` = inexistente nesta empresa ou já cancelado.
 * Roda na transação do serviço, junto com a auditoria.
 */
export async function cancelarLancamentoVariavelRepository(
  tx: TransacaoBanco,
  empresaId: string,
  id: string,
  dados: { canceladoPor: string; motivo: string }
) {
  const [linha] = await tx
    .update(questorEventosVariaveisLancamentos)
    .set({
      canceladoEm: new Date(),
      canceladoPor: dados.canceladoPor,
      motivoCancelamento: dados.motivo,
      atualizadoEm: new Date()
    })
    .where(
      and(
        eq(questorEventosVariaveisLancamentos.id, id),
        eq(questorEventosVariaveisLancamentos.empresaId, empresaId),
        isNull(questorEventosVariaveisLancamentos.canceladoEm)
      )
    )
    .returning({ id: questorEventosVariaveisLancamentos.id });
  return linha ?? null;
}
