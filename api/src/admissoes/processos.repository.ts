import { and, asc, count, eq, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  admissoesProcessos,
  admissoesProcessosHistorico,
  admissoesTestes
} from "@padaria/db/schema/admissoes";
import { perfisUsuarios } from "@padaria/db/schema/cadastro";
import type {
  AcaoHistoricoProcesso,
  MotivoCancelamentoProcesso,
  StatusProcesso
} from "@padaria/shared/admissoes";
import type { PaginationQuery, ResultadoPaginado } from "@padaria/shared/api";
import { banco, type TransacaoBanco } from "../banco/conexao.js";

// Aliases porque a MESMA tabela de perfis responde por tres papeis na mesma linha.
const perfilCriador = alias(perfisUsuarios, "perfil_criador_processo");
const perfilAtualizador = alias(perfisUsuarios, "perfil_atualizador_processo");
const perfilCancelador = alias(perfisUsuarios, "perfil_cancelador_processo");
const perfilAtor = alias(perfisUsuarios, "perfil_ator_processo");

export type ProcessoLinha = {
  id: string;
  status: StatusProcesso;
  versao: number;
  testeId: string;
  testeNomeCompleto: string;
  motivoCancelamento: MotivoCancelamentoProcesso | null;
  criadoPorNome: string | null;
  criadoEm: Date;
  atualizadoPorNome: string | null;
  atualizadoEm: Date;
  canceladoPorNome: string | null;
  canceladoEm: Date | null;
};

/**
 * Cria o processo. Chamado DENTRO da transacao que encerra o teste — nunca sozinho.
 *
 * `onConflictDoNothing` sobre `admissoes_processos_teste_unico`: se duas transacoes concorrentes
 * passarem juntas pelo lock, a segunda nao grava e recebe `undefined`. Quem chama decide o que fazer
 * — e o que ele faz e buscar o processo que a outra criou.
 */
export async function criarProcessoRepository(
  input: { empresaId: string; testeId: string; atorUsuarioId: string },
  db: TransacaoBanco
) {
  const [linha] = await db
    .insert(admissoesProcessos)
    .values({
      empresaId: input.empresaId,
      testeId: input.testeId,
      criadoPor: input.atorUsuarioId,
      atualizadoPor: input.atorUsuarioId
    })
    .onConflictDoNothing({ target: admissoesProcessos.testeId })
    .returning({ id: admissoesProcessos.id, versao: admissoesProcessos.versao });
  return linha ?? null;
}

/** O processo deste teste, se existir. E o que sustenta o ramo idempotente da efetivacao. */
export async function obterProcessoPorTesteRepository(
  testeId: string,
  empresaId: string,
  db: TransacaoBanco
) {
  const [linha] = await db
    .select({ id: admissoesProcessos.id, versao: admissoesProcessos.versao })
    .from(admissoesProcessos)
    .where(and(eq(admissoesProcessos.testeId, testeId), eq(admissoesProcessos.empresaId, empresaId)))
    .limit(1);
  return linha ?? null;
}

/**
 * Detalhe do processo.
 *
 * A empresa entra no proprio WHERE: "nao existe" e "e de outra empresa" produzem a MESMA resposta
 * vazia, entao a rota nao vira oraculo sobre processo de outro tenant.
 */
export async function obterProcessoRepository(id: string, empresaId: string): Promise<ProcessoLinha | null> {
  const [linha] = await banco
    .select({
      id: admissoesProcessos.id,
      status: admissoesProcessos.status,
      versao: admissoesProcessos.versao,
      testeId: admissoesProcessos.testeId,
      testeNomeCompleto: admissoesTestes.nomeCompleto,
      motivoCancelamento: admissoesProcessos.motivoCancelamento,
      // SO o nome. E-mail nunca entra na projecao.
      criadoPorNome: perfilCriador.nome,
      criadoEm: admissoesProcessos.criadoEm,
      atualizadoPorNome: perfilAtualizador.nome,
      atualizadoEm: admissoesProcessos.atualizadoEm,
      canceladoPorNome: perfilCancelador.nome,
      canceladoEm: admissoesProcessos.canceladoEm
    })
    .from(admissoesProcessos)
    // Join casando TAMBEM a empresa: mesma defesa em profundidade da FK composta.
    .innerJoin(
      admissoesTestes,
      and(
        eq(admissoesTestes.id, admissoesProcessos.testeId),
        eq(admissoesTestes.empresaId, admissoesProcessos.empresaId)
      )
    )
    .leftJoin(perfilCriador, eq(perfilCriador.usuarioId, admissoesProcessos.criadoPor))
    .leftJoin(perfilAtualizador, eq(perfilAtualizador.usuarioId, admissoesProcessos.atualizadoPor))
    .leftJoin(perfilCancelador, eq(perfilCancelador.usuarioId, admissoesProcessos.canceladoPor))
    .where(and(eq(admissoesProcessos.id, id), eq(admissoesProcessos.empresaId, empresaId)))
    .limit(1);
  return linha ?? null;
}

/** Bloqueia a linha antes de validar. Mesmo padrao da ADM-001. */
export async function bloquearProcessoRepository(id: string, empresaId: string, db: TransacaoBanco) {
  const [linha] = await db
    .select({
      id: admissoesProcessos.id,
      status: admissoesProcessos.status,
      versao: admissoesProcessos.versao
    })
    .from(admissoesProcessos)
    .where(and(eq(admissoesProcessos.id, id), eq(admissoesProcessos.empresaId, empresaId)))
    .limit(1)
    // `no key update` e nao `update`: o INSERT no historico toma FOR KEY SHARE implicito na linha pai
    // pela verificacao de FK, e FOR KEY SHARE conflita com FOR UPDATE.
    .for("no key update");
  return linha ?? null;
}

/** Cancela. `versaoAtual` no WHERE: retorno nulo significa que alguem alterou no meio. */
export async function cancelarProcessoRepository(
  input: {
    id: string;
    empresaId: string;
    versaoAtual: number;
    motivoCancelamento: MotivoCancelamentoProcesso;
    atorUsuarioId: string;
    canceladoEm: Date;
  },
  db: TransacaoBanco
) {
  const [linha] = await db
    .update(admissoesProcessos)
    .set({
      status: "cancelado",
      versao: input.versaoAtual + 1,
      motivoCancelamento: input.motivoCancelamento,
      atualizadoPor: input.atorUsuarioId,
      canceladoPor: input.atorUsuarioId,
      canceladoEm: input.canceladoEm
    })
    .where(
      and(
        eq(admissoesProcessos.id, input.id),
        eq(admissoesProcessos.empresaId, input.empresaId),
        eq(admissoesProcessos.versao, input.versaoAtual)
      )
    )
    .returning({ id: admissoesProcessos.id, versao: admissoesProcessos.versao });
  return linha ?? null;
}

export async function registrarEventoProcessoRepository(
  input: {
    processoId: string;
    empresaId: string;
    versao: number;
    acao: AcaoHistoricoProcesso;
    atorUsuarioId: string;
    camposAlterados?: string[];
  },
  db: TransacaoBanco
) {
  await db.insert(admissoesProcessosHistorico).values({
    processoId: input.processoId,
    empresaId: input.empresaId,
    versao: input.versao,
    acao: input.acao,
    atorUsuarioId: input.atorUsuarioId,
    camposAlterados: input.camposAlterados ?? []
  });
}

export async function listarHistoricoProcessoRepository(
  processoId: string,
  empresaId: string,
  query: PaginationQuery
): Promise<ResultadoPaginado<{
  id: string;
  versao: number;
  acao: AcaoHistoricoProcesso;
  atorNome: string | null;
  camposAlterados: string[];
  ocorridoEm: Date;
}>> {
  const filtros: SQL[] = [
    eq(admissoesProcessosHistorico.processoId, processoId),
    eq(admissoesProcessosHistorico.empresaId, empresaId)
  ];
  const where = and(...filtros);

  const [{ total } = { total: 0 }] = await banco
    .select({ total: count() })
    .from(admissoesProcessosHistorico)
    .where(where);

  const itens = await banco
    .select({
      id: admissoesProcessosHistorico.id,
      versao: admissoesProcessosHistorico.versao,
      acao: admissoesProcessosHistorico.acao,
      atorNome: perfilAtor.nome,
      camposAlterados: admissoesProcessosHistorico.camposAlterados,
      ocorridoEm: admissoesProcessosHistorico.ocorridoEm
    })
    .from(admissoesProcessosHistorico)
    .leftJoin(perfilAtor, eq(perfilAtor.usuarioId, admissoesProcessosHistorico.atorUsuarioId))
    .where(where)
    .orderBy(asc(admissoesProcessosHistorico.ocorridoEm), asc(admissoesProcessosHistorico.id))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);

  return { itens, total, page: query.page, pageSize: query.pageSize };
}
