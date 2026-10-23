import { and, asc, count, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  conferenciasAgendas,
  conferenciasEstoque,
  conferenciasEstoqueItens,
  gruposMercadorias,
  perfisUsuarios,
  produtos,
  unidadesMedida,
  usuariosEmpresas
} from "@padaria/db/schema";
import type { RankingConferencia, RegraRecorrencia } from "@padaria/shared/compras";
import { banco, type ExecutorBanco, type TransacaoBanco } from "../banco/conexao.js";

// Conferencia de estoque agendada (doc 57 §1). A agenda guarda o recorte e a recorrencia; cada data vira uma
// linha de conferencias_estoque com o retrato dos produtos (saldo do sistema) e a contagem. Nada aqui mexe
// no estoque: a contagem so registra.

export type RecorteEntrada = {
  grupoMercadoriaId: string | null;
  ranking: RankingConferencia | null;
  areaEstoque: string | null;
  localEstoque: string | null;
  localVenda: string | null;
};

export type AgendaConferenciaEntrada = RecorteEntrada & {
  empresaId: string;
  responsavelId: string;
  inicioEm: Date;
  fusoHorario: string;
  regra: RegraRecorrencia;
  terminoTipo: "nunca" | "data" | "quantidade";
  terminoEm: string | null;
  terminoQuantidade: number | null;
  observacao: string | null;
};

const responsavel = alias(perfisUsuarios, "responsavel");

export async function listarAgendasConferenciaRepository(empresaId: string, db: ExecutorBanco = banco) {
  return db
    .select({
      id: conferenciasAgendas.id,
      empresaId: conferenciasAgendas.empresaId,
      responsavelId: conferenciasAgendas.responsavelId,
      responsavelNome: responsavel.nome,
      grupoMercadoriaId: conferenciasAgendas.grupoMercadoriaId,
      grupo: gruposMercadorias.nome,
      ranking: conferenciasAgendas.ranking,
      areaEstoque: conferenciasAgendas.areaEstoque,
      localEstoque: conferenciasAgendas.localEstoque,
      localVenda: conferenciasAgendas.localVenda,
      inicioEm: conferenciasAgendas.inicioEm,
      fusoHorario: conferenciasAgendas.fusoHorario,
      regra: conferenciasAgendas.regra,
      terminoTipo: conferenciasAgendas.terminoTipo,
      terminoEm: conferenciasAgendas.terminoEm,
      terminoQuantidade: conferenciasAgendas.terminoQuantidade,
      observacao: conferenciasAgendas.observacao,
      criadoPor: conferenciasAgendas.criadoPor
    })
    .from(conferenciasAgendas)
    .innerJoin(responsavel, eq(responsavel.usuarioId, conferenciasAgendas.responsavelId))
    .leftJoin(gruposMercadorias, eq(gruposMercadorias.id, conferenciasAgendas.grupoMercadoriaId))
    .where(and(eq(conferenciasAgendas.empresaId, empresaId), eq(conferenciasAgendas.status, "ativa")))
    .orderBy(asc(conferenciasAgendas.inicioEm));
}

/** Todas as agendas ativas (o agendador percorre as empresas). */
export async function agendasConferenciaAtivasRepository(db: ExecutorBanco = banco) {
  return db
    .select({
      id: conferenciasAgendas.id,
      empresaId: conferenciasAgendas.empresaId,
      responsavelId: conferenciasAgendas.responsavelId,
      grupoMercadoriaId: conferenciasAgendas.grupoMercadoriaId,
      grupo: gruposMercadorias.nome,
      ranking: conferenciasAgendas.ranking,
      areaEstoque: conferenciasAgendas.areaEstoque,
      localEstoque: conferenciasAgendas.localEstoque,
      localVenda: conferenciasAgendas.localVenda,
      inicioEm: conferenciasAgendas.inicioEm,
      fusoHorario: conferenciasAgendas.fusoHorario,
      regra: conferenciasAgendas.regra,
      terminoTipo: conferenciasAgendas.terminoTipo,
      terminoEm: conferenciasAgendas.terminoEm,
      terminoQuantidade: conferenciasAgendas.terminoQuantidade,
      observacao: conferenciasAgendas.observacao,
      criadoPor: conferenciasAgendas.criadoPor
    })
    .from(conferenciasAgendas)
    .leftJoin(gruposMercadorias, eq(gruposMercadorias.id, conferenciasAgendas.grupoMercadoriaId))
    .where(eq(conferenciasAgendas.status, "ativa"));
}

export async function criarAgendaConferenciaRepository(
  input: AgendaConferenciaEntrada & { criadoPor: string },
  tx: TransacaoBanco
) {
  const [linha] = await tx.insert(conferenciasAgendas).values(input).returning({ id: conferenciasAgendas.id });
  if (!linha) throw new Error("Agenda de conferencia nao criada");
  return linha;
}

export async function travarAgendaConferenciaRepository(id: string, empresaId: string, tx: TransacaoBanco) {
  const [linha] = await tx
    .select({ id: conferenciasAgendas.id, status: conferenciasAgendas.status })
    .from(conferenciasAgendas)
    .where(and(eq(conferenciasAgendas.id, id), eq(conferenciasAgendas.empresaId, empresaId)))
    .for("update")
    .limit(1);
  return linha ?? null;
}

export async function atualizarAgendaConferenciaRepository(
  id: string,
  input: AgendaConferenciaEntrada,
  tx: TransacaoBanco
) {
  await tx.update(conferenciasAgendas).set(input).where(eq(conferenciasAgendas.id, id));
}

export async function encerrarAgendaConferenciaRepository(id: string, tx: TransacaoBanco) {
  await tx
    .update(conferenciasAgendas)
    .set({ status: "encerrada", encerradaEm: new Date() })
    .where(eq(conferenciasAgendas.id, id));
}

/** Datas da agenda que ja viraram conferencia (para o agendador nao criar de novo). */
export async function datasJaCriadasRepository(agendaId: string, db: ExecutorBanco = banco) {
  const linhas = await db
    .select({ previstoPara: conferenciasEstoque.previstoPara })
    .from(conferenciasEstoque)
    .where(and(eq(conferenciasEstoque.agendaId, agendaId), isNotNull(conferenciasEstoque.previstoPara)));
  return new Set(linhas.map((linha) => linha.previstoPara!.getTime()));
}

/** A conferencia do dia. O UNIQUE(agenda, previsto_para) faz a segunda tentativa nao criar nada. */
export async function criarConferenciaDoDiaRepository(
  input: RecorteEntrada & {
    empresaId: string;
    agendaId: string;
    previstoPara: Date;
    responsavelId: string;
    observacao: string | null;
    criadoPor: string;
    itens: Array<{ produtoId: string; saldoSistema: string }>;
  },
  tx: TransacaoBanco
): Promise<string | null> {
  const [linha] = await tx
    .insert(conferenciasEstoque)
    .values({
      empresaId: input.empresaId,
      grupoMercadoriaId: input.grupoMercadoriaId,
      areaEstoque: input.areaEstoque,
      localEstoque: input.localEstoque,
      localVenda: input.localVenda,
      ranking: input.ranking,
      agendadaPara: input.previstoPara,
      previstoPara: input.previstoPara,
      agendaId: input.agendaId,
      responsavelId: input.responsavelId,
      observacao: input.observacao,
      criadoPor: input.criadoPor
    })
    .onConflictDoNothing()
    .returning({ id: conferenciasEstoque.id });
  if (!linha) return null;
  if (input.itens.length)
    await tx.insert(conferenciasEstoqueItens).values(
      input.itens.map((item) => ({
        empresaId: input.empresaId,
        conferenciaId: linha.id,
        produtoId: item.produtoId,
        saldoSistema: item.saldoSistema
      }))
    );
  return linha.id;
}

const colunasConferencia = {
  id: conferenciasEstoque.id,
  agendaId: conferenciasEstoque.agendaId,
  data: conferenciasEstoque.agendadaPara,
  status: conferenciasEstoque.status,
  responsavelId: conferenciasEstoque.responsavelId,
  responsavelNome: responsavel.nome,
  grupoMercadoriaId: conferenciasEstoque.grupoMercadoriaId,
  grupo: gruposMercadorias.nome,
  ranking: conferenciasEstoque.ranking,
  areaEstoque: conferenciasEstoque.areaEstoque,
  localEstoque: conferenciasEstoque.localEstoque,
  localVenda: conferenciasEstoque.localVenda,
  concluidaEm: conferenciasEstoque.concluidaEm,
  observacao: conferenciasEstoque.observacao
};

export async function listarConferenciasRepository(empresaId: string, db: ExecutorBanco = banco) {
  return db
    .select(colunasConferencia)
    .from(conferenciasEstoque)
    .leftJoin(responsavel, eq(responsavel.usuarioId, conferenciasEstoque.responsavelId))
    .leftJoin(gruposMercadorias, eq(gruposMercadorias.id, conferenciasEstoque.grupoMercadoriaId))
    .where(eq(conferenciasEstoque.empresaId, empresaId))
    .orderBy(desc(conferenciasEstoque.agendadaPara))
    .limit(300);
}

export async function buscarConferenciaRepository(id: string, empresaId: string, db: ExecutorBanco = banco) {
  const [linha] = await db
    .select(colunasConferencia)
    .from(conferenciasEstoque)
    .leftJoin(responsavel, eq(responsavel.usuarioId, conferenciasEstoque.responsavelId))
    .leftJoin(gruposMercadorias, eq(gruposMercadorias.id, conferenciasEstoque.grupoMercadoriaId))
    .where(and(eq(conferenciasEstoque.id, id), eq(conferenciasEstoque.empresaId, empresaId)))
    .limit(1);
  return linha ?? null;
}

export async function travarConferenciaRepository(id: string, empresaId: string, tx: TransacaoBanco) {
  const [linha] = await tx
    .select({
      id: conferenciasEstoque.id,
      status: conferenciasEstoque.status,
      responsavelId: conferenciasEstoque.responsavelId
    })
    .from(conferenciasEstoque)
    .where(and(eq(conferenciasEstoque.id, id), eq(conferenciasEstoque.empresaId, empresaId)))
    .for("update")
    .limit(1);
  return linha ?? null;
}

/** Quantos itens e quantos ja contados, por conferencia. */
export async function contagensRepository(conferenciaIds: string[], db: ExecutorBanco = banco) {
  if (!conferenciaIds.length) return new Map<string, { total: number; contados: number }>();
  const [totais, contados] = await Promise.all([
    db
      .select({ conferenciaId: conferenciasEstoqueItens.conferenciaId, total: count() })
      .from(conferenciasEstoqueItens)
      .where(inArray(conferenciasEstoqueItens.conferenciaId, conferenciaIds))
      .groupBy(conferenciasEstoqueItens.conferenciaId),
    db
      .select({ conferenciaId: conferenciasEstoqueItens.conferenciaId, total: count() })
      .from(conferenciasEstoqueItens)
      .where(
        and(
          inArray(conferenciasEstoqueItens.conferenciaId, conferenciaIds),
          isNotNull(conferenciasEstoqueItens.quantidadeContada)
        )
      )
      .groupBy(conferenciasEstoqueItens.conferenciaId)
  ]);
  const contadosPor = new Map(contados.map((linha) => [linha.conferenciaId, Number(linha.total)]));
  return new Map(
    totais.map((linha) => [
      linha.conferenciaId,
      { total: Number(linha.total), contados: contadosPor.get(linha.conferenciaId) ?? 0 }
    ])
  );
}

export async function itensDaConferenciaRepository(conferenciaId: string, db: ExecutorBanco = banco) {
  return db
    .select({
      itemId: conferenciasEstoqueItens.id,
      produtoId: conferenciasEstoqueItens.produtoId,
      descricao: produtos.descricao,
      grupo: gruposMercadorias.nome,
      unidade: unidadesMedida.sigla,
      saldoSistema: conferenciasEstoqueItens.saldoSistema,
      quantidadeContada: conferenciasEstoqueItens.quantidadeContada
    })
    .from(conferenciasEstoqueItens)
    .innerJoin(produtos, eq(produtos.id, conferenciasEstoqueItens.produtoId))
    .leftJoin(gruposMercadorias, eq(gruposMercadorias.id, produtos.grupoMercadoriaId))
    .leftJoin(unidadesMedida, eq(unidadesMedida.id, produtos.unidadeIndividualId))
    .where(eq(conferenciasEstoqueItens.conferenciaId, conferenciaId))
    .orderBy(asc(produtos.descricao));
}

export async function registrarContagemRepository(
  input: {
    conferenciaId: string;
    usuarioId: string;
    itens: Array<{ itemId: string; quantidadeContada: number | null }>;
  },
  tx: TransacaoBanco
): Promise<number> {
  let alterados = 0;
  const agora = new Date();
  for (const item of input.itens) {
    const contado = item.quantidadeContada !== null;
    const linhas = await tx
      .update(conferenciasEstoqueItens)
      .set({
        quantidadeContada: contado ? String(item.quantidadeContada) : null,
        contadoPor: contado ? input.usuarioId : null,
        contadoEm: contado ? agora : null
      })
      .where(
        and(
          eq(conferenciasEstoqueItens.id, item.itemId),
          eq(conferenciasEstoqueItens.conferenciaId, input.conferenciaId)
        )
      )
      .returning({ id: conferenciasEstoqueItens.id });
    alterados += linhas.length;
  }
  return alterados;
}

export async function concluirConferenciaRepository(id: string, usuarioId: string, tx: TransacaoBanco) {
  await tx
    .update(conferenciasEstoque)
    .set({ status: "concluida", concluidaPor: usuarioId, concluidaEm: new Date() })
    .where(eq(conferenciasEstoque.id, id));
}

/** Usuarios que trabalham na empresa (o servico filtra quem pode ver conferencias). */
export async function usuariosDaEmpresaRepository(empresaId: string, db: ExecutorBanco = banco) {
  return db
    .select({ usuarioId: perfisUsuarios.usuarioId, nome: perfisUsuarios.nome })
    .from(usuariosEmpresas)
    .innerJoin(perfisUsuarios, eq(perfisUsuarios.usuarioId, usuariosEmpresas.usuarioId))
    .where(eq(usuariosEmpresas.empresaId, empresaId))
    .orderBy(asc(perfisUsuarios.nome));
}
