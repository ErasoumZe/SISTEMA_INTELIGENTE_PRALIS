import { and, desc, eq, inArray, isNotNull, max } from "drizzle-orm";
import {
  perfisUsuarios,
  questorConfiguracoes,
  questorExportacoes,
  questorExportacoesAdmissoes,
  questorExportacoesEventosVariaveis
} from "@padaria/db/schema";
import { banco, executarEmTransacao, type TransacaoBanco } from "../banco/conexao.js";

/** Auditoria das exportações Questor (tabelas da migration 0077). */

export type TipoExportacaoQuestor = "admissao" | "eventos_variaveis";
export type ResultadoExportacaoQuestor = "previa" | "gerado" | "bloqueado" | "falhou";

const colunasHistorico = {
  id: questorExportacoes.id,
  tipo: questorExportacoes.tipo,
  competencia: questorExportacoes.competencia,
  layoutVersao: questorExportacoes.layoutVersao,
  sha256: questorExportacoes.sha256,
  resultado: questorExportacoes.resultado,
  nomeArquivo: questorExportacoes.nomeArquivo,
  caminhoArquivo: questorExportacoes.caminhoArquivo,
  diagnosticos: questorExportacoes.diagnosticos,
  motivoRegeracao: questorExportacoes.motivoRegeracao,
  codigoPeriodoCalculo: questorExportacoes.codigoPeriodoCalculo,
  geradoPorNome: perfisUsuarios.nome,
  geradoEm: questorExportacoes.geradoEm
};

export function listarQuestorExportacoesRepository(empresaId: string, tipo?: TipoExportacaoQuestor, limite = 50) {
  const condicoes = [eq(questorExportacoes.empresaId, empresaId)];
  if (tipo) condicoes.push(eq(questorExportacoes.tipo, tipo));
  return banco
    .select(colunasHistorico)
    .from(questorExportacoes)
    .leftJoin(perfisUsuarios, eq(perfisUsuarios.usuarioId, questorExportacoes.geradoPor))
    .where(and(...condicoes))
    .orderBy(desc(questorExportacoes.criadoEm))
    .limit(limite);
}

export async function obterQuestorExportacaoRepository(empresaId: string, id: string) {
  const [linha] = await banco
    .select(colunasHistorico)
    .from(questorExportacoes)
    .leftJoin(perfisUsuarios, eq(perfisUsuarios.usuarioId, questorExportacoes.geradoPor))
    .where(and(eq(questorExportacoes.id, id), eq(questorExportacoes.empresaId, empresaId)))
    .limit(1);
  return linha ?? null;
}

export async function buscarExportacaoPorChaveRepository(
  empresaId: string,
  tipo: TipoExportacaoQuestor,
  chaveIdempotencia: string
) {
  const [linha] = await banco
    .select({ id: questorExportacoes.id, nomeArquivo: questorExportacoes.nomeArquivo })
    .from(questorExportacoes)
    .where(
      and(
        eq(questorExportacoes.empresaId, empresaId),
        eq(questorExportacoes.tipo, tipo),
        eq(questorExportacoes.chaveIdempotencia, chaveIdempotencia)
      )
    )
    .limit(1);
  return linha ?? null;
}

/** Processos da lista que já saíram num arquivo OFICIAL (`gerado`) desta empresa. */
export async function processosJaExportadosRepository(empresaId: string, processoIds: readonly string[]) {
  const linhas = await banco
    .selectDistinct({ processoId: questorExportacoesAdmissoes.processoId })
    .from(questorExportacoesAdmissoes)
    .innerJoin(
      questorExportacoes,
      and(
        eq(questorExportacoes.id, questorExportacoesAdmissoes.exportacaoId),
        eq(questorExportacoes.empresaId, questorExportacoesAdmissoes.empresaId)
      )
    )
    .where(
      and(
        eq(questorExportacoesAdmissoes.empresaId, empresaId),
        inArray(questorExportacoesAdmissoes.processoId, [...processoIds]),
        eq(questorExportacoes.resultado, "gerado")
      )
    );
  return linhas.map((linha) => linha.processoId);
}

/** Lançamentos da lista que já saíram num CSV OFICIAL (`gerado`) desta empresa. */
export async function lancamentosJaExportadosRepository(
  empresaId: string,
  lancamentoIds: readonly string[],
  executor: TransacaoBanco | typeof banco = banco
) {
  const linhas = await executor
    .selectDistinct({ lancamentoId: questorExportacoesEventosVariaveis.lancamentoId })
    .from(questorExportacoesEventosVariaveis)
    .innerJoin(
      questorExportacoes,
      and(
        eq(questorExportacoes.id, questorExportacoesEventosVariaveis.exportacaoId),
        eq(questorExportacoes.empresaId, questorExportacoesEventosVariaveis.empresaId)
      )
    )
    .where(
      and(
        eq(questorExportacoesEventosVariaveis.empresaId, empresaId),
        inArray(questorExportacoesEventosVariaveis.lancamentoId, [...lancamentoIds]),
        eq(questorExportacoes.resultado, "gerado")
      )
    );
  return linhas.map((linha) => linha.lancamentoId);
}

export type NovaExportacaoQuestor = {
  empresaId: string;
  tipo: TipoExportacaoQuestor;
  competencia: string | null;
  layoutVersao: string;
  sha256: string;
  chaveIdempotencia: string;
  resultado: ResultadoExportacaoQuestor;
  nomeArquivo: string | null;
  caminhoArquivo: string | null;
  diagnosticos: string[];
  motivoRegeracao: string | null;
  geradoPor: string;
  codigoPeriodoCalculo?: string | null;
  processoIds?: readonly string[];
  /** Lançamentos do arquivo. Com `sequencia` = linha OFICIAL (entra na chave do Questor). */
  lancamentos?: ReadonlyArray<{ lancamentoId: string; codigoContrato?: string; sequencia?: number }>;
};

/**
 * Registra a exportação e os vínculos (processos ou lançamentos) numa transação. `criada: false` =
 * a mesma chave de idempotência já existia; nada é gravado e o registro existente é devolvido.
 */
/**
 * Trava as exportações de eventos da empresa até o fim da transação (linha da configuração Questor,
 * SELECT … FOR UPDATE). Duas gerações oficiais simultâneas da mesma empresa ficam em fila, e a segunda
 * já enxerga o que a primeira gravou. Sem configuração não há arquivo válido (falta a coluna 2).
 */
export async function travarExportacaoEventosRepository(tx: TransacaoBanco, empresaId: string) {
  await tx
    .select({ id: questorConfiguracoes.id })
    .from(questorConfiguracoes)
    .where(eq(questorConfiguracoes.empresaId, empresaId))
    .for("update");
}

export async function registrarExportacaoQuestorRepository(
  dados: NovaExportacaoQuestor,
  /** Roda dentro da mesma transação, antes do insert (trava + reconferência). Lança para abortar. */
  antesDeGravar?: (tx: TransacaoBanco) => Promise<void>
): Promise<{ id: string; criada: boolean }> {
  const { processoIds = [], lancamentos = [], ...linha } = dados;
  return executarEmTransacao(async (tx) => {
    if (antesDeGravar) await antesDeGravar(tx);
    const [inserida] = await tx
      .insert(questorExportacoes)
      .values(linha)
      .onConflictDoNothing({
        target: [questorExportacoes.empresaId, questorExportacoes.tipo, questorExportacoes.chaveIdempotencia]
      })
      .returning({ id: questorExportacoes.id });
    if (!inserida) {
      const [existente] = await tx
        .select({ id: questorExportacoes.id })
        .from(questorExportacoes)
        .where(
          and(
            eq(questorExportacoes.empresaId, linha.empresaId),
            eq(questorExportacoes.tipo, linha.tipo),
            eq(questorExportacoes.chaveIdempotencia, linha.chaveIdempotencia)
          )
        )
        .limit(1);
      if (!existente) throw new Error("Exportação Questor concorrente não encontrada");
      return { id: existente.id, criada: false };
    }
    if (processoIds.length) {
      await tx
        .insert(questorExportacoesAdmissoes)
        .values(
          processoIds.map((processoId) => ({ exportacaoId: inserida.id, processoId, empresaId: linha.empresaId }))
        );
    }
    if (lancamentos.length) {
      await tx.insert(questorExportacoesEventosVariaveis).values(
        lancamentos.map((item) => ({
          exportacaoId: inserida.id,
          lancamentoId: item.lancamentoId,
          empresaId: linha.empresaId,
          ...(item.sequencia !== undefined
            ? {
                sequencia: item.sequencia,
                codigoContrato: item.codigoContrato ?? null,
                codigoPeriodoCalculo: linha.codigoPeriodoCalculo ?? null
              }
            : {})
        }))
      );
    }
    return { id: inserida.id, criada: true };
  });
}

/** Maior sequência já usada em arquivo oficial, por contrato, neste período de cálculo da empresa. */
export async function sequenciasUsadasRepository(empresaId: string, codigoPeriodoCalculo: string) {
  const linhas = await banco
    .select({
      codigoContrato: questorExportacoesEventosVariaveis.codigoContrato,
      maior: max(questorExportacoesEventosVariaveis.sequencia)
    })
    .from(questorExportacoesEventosVariaveis)
    .where(
      and(
        eq(questorExportacoesEventosVariaveis.empresaId, empresaId),
        eq(questorExportacoesEventosVariaveis.codigoPeriodoCalculo, codigoPeriodoCalculo),
        isNotNull(questorExportacoesEventosVariaveis.sequencia)
      )
    )
    .groupBy(questorExportacoesEventosVariaveis.codigoContrato);
  return new Map(
    linhas.flatMap((linha) =>
      linha.codigoContrato && linha.maior !== null ? [[linha.codigoContrato, linha.maior]] : []
    )
  );
}

/**
 * Exportação OFICIAL anterior com exatamente estes lançamentos neste período: repetir o pedido devolve o
 * mesmo arquivo em vez de gerar outro com sequências novas (que o Questor importaria em duplicidade).
 */
export async function exportacaoOficialDosLancamentosRepository(
  empresaId: string,
  codigoPeriodoCalculo: string,
  lancamentoIds: readonly string[]
) {
  const candidatas = await banco
    .select({
      exportacaoId: questorExportacoesEventosVariaveis.exportacaoId,
      lancamentoId: questorExportacoesEventosVariaveis.lancamentoId,
      criadoEm: questorExportacoes.criadoEm
    })
    .from(questorExportacoesEventosVariaveis)
    .innerJoin(
      questorExportacoes,
      and(
        eq(questorExportacoes.id, questorExportacoesEventosVariaveis.exportacaoId),
        eq(questorExportacoes.empresaId, questorExportacoesEventosVariaveis.empresaId)
      )
    )
    .where(
      and(
        eq(questorExportacoesEventosVariaveis.empresaId, empresaId),
        eq(questorExportacoes.resultado, "gerado"),
        eq(questorExportacoes.codigoPeriodoCalculo, codigoPeriodoCalculo),
        inArray(
          questorExportacoesEventosVariaveis.exportacaoId,
          banco
            .select({ id: questorExportacoesEventosVariaveis.exportacaoId })
            .from(questorExportacoesEventosVariaveis)
            .where(
              and(
                eq(questorExportacoesEventosVariaveis.empresaId, empresaId),
                inArray(questorExportacoesEventosVariaveis.lancamentoId, [...lancamentoIds])
              )
            )
        )
      )
    );
  // Mais recente primeiro: depois de uma reexportação com motivo, vale o arquivo novo.
  candidatas.sort((a, b) => b.criadoEm.getTime() - a.criadoEm.getTime());
  const porExportacao = new Map<string, Set<string>>();
  for (const { exportacaoId, lancamentoId } of candidatas) {
    porExportacao.set(exportacaoId, (porExportacao.get(exportacaoId) ?? new Set()).add(lancamentoId));
  }
  const alvo = new Set(lancamentoIds);
  for (const [exportacaoId, ids] of porExportacao) {
    if (ids.size === alvo.size && [...ids].every((id) => alvo.has(id))) return exportacaoId;
  }
  return null;
}
