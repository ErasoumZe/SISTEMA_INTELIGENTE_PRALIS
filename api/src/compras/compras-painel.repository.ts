import { and, asc, count, eq, inArray, isNull } from "drizzle-orm";
import {
  comprasConvitesItens,
  comprasRodadas,
  comprasRodadasConvites,
  comprasRodadasItens,
  comprasSolicitacoes,
  comprasSolicitacoesItens,
  fornecedores
} from "@padaria/db/schema";
import { banco, type ExecutorBanco } from "../banco/conexao.js";

// MODULO DO COMPRADOR — o que alimenta a matriz de Pedidos (doc 57 §4) e nao e pedido.

/** Itens de cotacoes abertas sem nenhum convite: o "A fazer" sem fornecedor. */
export async function itensSemFornecedorRepository(empresaId: string, db: ExecutorBanco = banco) {
  return db
    .select({
      rodadaId: comprasRodadas.id,
      rodadaNumero: comprasRodadas.numero,
      rodadaItemId: comprasRodadasItens.id,
      produtoId: comprasSolicitacoesItens.produtoId,
      descricaoProduto: comprasSolicitacoesItens.descricaoProduto,
      quantidade: comprasRodadasItens.quantidade,
      expiraEm: comprasRodadas.expiraEm
    })
    .from(comprasRodadasItens)
    .innerJoin(comprasRodadas, eq(comprasRodadas.id, comprasRodadasItens.rodadaId))
    .innerJoin(comprasSolicitacoesItens, eq(comprasSolicitacoesItens.id, comprasRodadasItens.solicitacaoItemId))
    .leftJoin(comprasConvitesItens, eq(comprasConvitesItens.rodadaItemId, comprasRodadasItens.id))
    .where(
      and(eq(comprasRodadas.empresaId, empresaId), eq(comprasRodadas.status, "aberta"), isNull(comprasConvitesItens.id))
    )
    .orderBy(asc(comprasRodadas.expiraEm), asc(comprasSolicitacoesItens.descricaoProduto));
}

/** Solicitacoes cuja cotacao fechou com item sem vencedor (a fila de decisao). */
export async function decisoesPendentesRepository(empresaId: string, db: ExecutorBanco = banco) {
  return db
    .select({
      solicitacaoId: comprasSolicitacoes.id,
      observacao: comprasSolicitacoes.observacao,
      rodadaId: comprasRodadas.id,
      rodadaNumero: comprasRodadas.numero,
      fechadaEm: comprasRodadas.fechadaEm
    })
    .from(comprasSolicitacoes)
    .innerJoin(comprasRodadas, eq(comprasRodadas.solicitacaoId, comprasSolicitacoes.id))
    .where(
      and(
        eq(comprasSolicitacoes.empresaId, empresaId),
        eq(comprasSolicitacoes.status, "parcialmente_comprada"),
        eq(comprasRodadas.status, "fechada")
      )
    )
    .orderBy(asc(comprasRodadas.fechadaEm));
}

/** Convites de cotacoes abertas que ainda nao terminaram. */
export async function convitesAbertosRepository(empresaId: string, db: ExecutorBanco = banco) {
  return db
    .select({
      conviteId: comprasRodadasConvites.id,
      status: comprasRodadasConvites.status,
      rodadaId: comprasRodadas.id,
      solicitacaoId: comprasRodadas.solicitacaoId,
      rodadaNumero: comprasRodadas.numero,
      expiraEm: comprasRodadas.expiraEm,
      fornecedorId: fornecedores.id,
      fornecedorNome: fornecedores.nome
    })
    .from(comprasRodadasConvites)
    .innerJoin(comprasRodadas, eq(comprasRodadas.id, comprasRodadasConvites.rodadaId))
    .innerJoin(fornecedores, eq(fornecedores.id, comprasRodadasConvites.fornecedorId))
    .where(
      and(
        eq(comprasRodadas.empresaId, empresaId),
        eq(comprasRodadas.status, "aberta"),
        inArray(comprasRodadasConvites.status, ["aberto", "aguardando_comprador"])
      )
    )
    .orderBy(asc(fornecedores.nome), asc(comprasRodadas.expiraEm));
}

export async function totalItensDosConvitesRepository(conviteIds: string[], db: ExecutorBanco = banco) {
  if (!conviteIds.length) return new Map<string, number>();
  const linhas = await db
    .select({ conviteId: comprasConvitesItens.conviteId, total: count() })
    .from(comprasConvitesItens)
    .where(inArray(comprasConvitesItens.conviteId, conviteIds))
    .groupBy(comprasConvitesItens.conviteId);
  return new Map(linhas.map((linha) => [linha.conviteId, Number(linha.total)]));
}
