import { and, eq, inArray, or } from "drizzle-orm";
import {
  comprasAdjudicacoes,
  comprasConvitesItens,
  comprasPropostas,
  comprasPropostasItens,
  comprasRodadas,
  comprasRodadasConvites,
  comprasRodadasItens,
  comprasSolicitacoes,
  comprasSolicitacoesItens,
  fornecedores
} from "@padaria/db/schema";
import { banco, type ExecutorBanco } from "../banco/conexao.js";

// MODULO DO COMPRADOR — a matriz Cotacao por fornecedor (doc 58 §4): produto x situacao de cada fornecedor.

/**
 * Itens em cotacao: os de cotacoes abertas e os de cotacoes fechadas que ainda esperam decisao (solicitacao
 * parcialmente comprada). Opcional: so de um produto (o detalhe).
 */
export async function itensEmCotacaoRepository(empresaId: string, produtoId?: string, db: ExecutorBanco = banco) {
  return db
    .select({
      rodadaItemId: comprasRodadasItens.id,
      rodadaId: comprasRodadas.id,
      rodadaNumero: comprasRodadas.numero,
      rodadaStatus: comprasRodadas.status,
      expiraEm: comprasRodadas.expiraEm,
      solicitacaoId: comprasRodadas.solicitacaoId,
      produtoId: comprasSolicitacoesItens.produtoId,
      descricao: comprasSolicitacoesItens.descricaoProduto,
      quantidade: comprasRodadasItens.quantidade,
      precoBaseValor: comprasRodadasItens.precoBaseValor
    })
    .from(comprasRodadasItens)
    .innerJoin(comprasRodadas, eq(comprasRodadas.id, comprasRodadasItens.rodadaId))
    .innerJoin(comprasSolicitacoes, eq(comprasSolicitacoes.id, comprasRodadas.solicitacaoId))
    .innerJoin(comprasSolicitacoesItens, eq(comprasSolicitacoesItens.id, comprasRodadasItens.solicitacaoItemId))
    .where(
      and(
        eq(comprasRodadas.empresaId, empresaId),
        ...(produtoId ? [eq(comprasSolicitacoesItens.produtoId, produtoId)] : []),
        or(
          eq(comprasRodadas.status, "aberta"),
          and(eq(comprasRodadas.status, "fechada"), eq(comprasSolicitacoes.status, "parcialmente_comprada"))
        )
      )
    );
}

/** Para quem cada item foi enviado. */
export async function convitesDosItensRepository(rodadaItemIds: string[], db: ExecutorBanco = banco) {
  if (!rodadaItemIds.length) return [];
  return db
    .select({
      rodadaItemId: comprasConvitesItens.rodadaItemId,
      conviteItemId: comprasConvitesItens.id,
      conviteId: comprasRodadasConvites.id,
      fornecedorId: fornecedores.id,
      fornecedorNome: fornecedores.nome
    })
    .from(comprasConvitesItens)
    .innerJoin(comprasRodadasConvites, eq(comprasRodadasConvites.id, comprasConvitesItens.conviteId))
    .innerJoin(fornecedores, eq(fornecedores.id, comprasRodadasConvites.fornecedorId))
    .where(inArray(comprasConvitesItens.rodadaItemId, rodadaItemIds));
}

/** As respostas do fornecedor (enviadas e rascunho) por item do convite. */
export async function respostasDosItensRepository(conviteItemIds: string[], db: ExecutorBanco = banco) {
  if (!conviteItemIds.length) return [];
  return db
    .select({
      conviteItemId: comprasPropostasItens.conviteItemId,
      propostaItemId: comprasPropostasItens.id,
      versao: comprasPropostas.versao,
      status: comprasPropostas.status,
      indisponivel: comprasPropostasItens.indisponivel,
      valorUnitario: comprasPropostasItens.valorUnitario,
      custoFinalUnitario: comprasPropostasItens.custoFinalUnitario,
      quantidadeDisponivel: comprasPropostasItens.quantidadeDisponivel
    })
    .from(comprasPropostasItens)
    .innerJoin(comprasPropostas, eq(comprasPropostas.id, comprasPropostasItens.propostaId))
    .where(
      and(inArray(comprasPropostasItens.conviteItemId, conviteItemIds), eq(comprasPropostas.autorTipo, "fornecedor"))
    );
}

/** Quem ganhou cada item. */
export async function vencedoresDosItensRepository(rodadaItemIds: string[], db: ExecutorBanco = banco) {
  if (!rodadaItemIds.length) return new Map<string, string>();
  const linhas = await db
    .select({ rodadaItemId: comprasAdjudicacoes.rodadaItemId, fornecedorId: comprasAdjudicacoes.fornecedorId })
    .from(comprasAdjudicacoes)
    .where(inArray(comprasAdjudicacoes.rodadaItemId, rodadaItemIds));
  return new Map(linhas.map((linha) => [linha.rodadaItemId, linha.fornecedorId]));
}
