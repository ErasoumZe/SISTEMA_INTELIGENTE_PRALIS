import { and, desc, eq, inArray, ne } from "drizzle-orm";
import {
  comprasAdjudicacoes,
  comprasPropostas,
  comprasPropostasItens,
  comprasRodadas,
  comprasRodadasConvites,
  comprasRodadasItens,
  fornecedores,
  pedidos,
  pedidosEventos,
  pedidosItens
} from "@padaria/db/schema";
import { banco, type ExecutorBanco, type TransacaoBanco } from "../banco/conexao.js";

// MODULO DO COMPRADOR — passo 2 da cotacao (doc 57 §5): o fornecedor ajusta a quantidade real do que
// ganhou e devolve; o comprador confirma. O modulo publico so chega aqui pelo controller (injecao).

/** O pedido do fornecedor nesta rodada (o mais recente que nao foi cancelado). */
export async function pedidoDoConviteRepository(conviteId: string, db: ExecutorBanco = banco) {
  const [linha] = await db
    .select({
      pedidoId: pedidos.id,
      status: pedidos.status,
      empresaId: pedidos.empresaId,
      margemVariacaoPercentual: comprasRodadas.margemVariacaoPercentual,
      abertaPor: comprasRodadas.abertaPor,
      rodadaId: comprasRodadas.id
    })
    .from(comprasRodadasConvites)
    .innerJoin(comprasRodadas, eq(comprasRodadas.id, comprasRodadasConvites.rodadaId))
    .innerJoin(
      pedidos,
      and(
        eq(pedidos.rodadaId, comprasRodadasConvites.rodadaId),
        eq(pedidos.fornecedorId, comprasRodadasConvites.fornecedorId)
      )
    )
    .where(and(eq(comprasRodadasConvites.id, conviteId), ne(pedidos.status, "cancelado")))
    .orderBy(desc(pedidos.criadoEm))
    .limit(1);
  return linha ?? null;
}

/** Itens do pedido com a quantidade pedida na rodada e o valor que ganhou. */
export async function itensDoPedidoDaRodadaRepository(pedidoId: string, db: ExecutorBanco = banco) {
  return db
    .select({
      pedidoItemId: pedidosItens.id,
      descricaoProduto: pedidosItens.descricaoProduto,
      quantidade: pedidosItens.quantidade,
      quantidadePedida: comprasRodadasItens.quantidade,
      valorUnitario: comprasPropostasItens.valorUnitario,
      adjudicacaoId: comprasAdjudicacoes.id
    })
    .from(pedidosItens)
    .innerJoin(comprasAdjudicacoes, eq(comprasAdjudicacoes.pedidoItemId, pedidosItens.id))
    .innerJoin(comprasRodadasItens, eq(comprasRodadasItens.id, comprasAdjudicacoes.rodadaItemId))
    .innerJoin(comprasPropostasItens, eq(comprasPropostasItens.id, comprasAdjudicacoes.propostaItemId))
    .where(eq(pedidosItens.pedidoId, pedidoId));
}

export async function travarPedidoRepository(pedidoId: string, tx: TransacaoBanco) {
  const [linha] = await tx
    .select({
      id: pedidos.id,
      empresaId: pedidos.empresaId,
      status: pedidos.status,
      tipo: pedidos.tipo,
      fornecedorId: pedidos.fornecedorId,
      fornecedorWhatsapp: fornecedores.whatsapp
    })
    .from(pedidos)
    .leftJoin(fornecedores, eq(fornecedores.id, pedidos.fornecedorId))
    .where(eq(pedidos.id, pedidoId))
    .for("update", { of: pedidos })
    .limit(1);
  return linha ?? null;
}

export async function ajustarQuantidadesRepository(
  itens: Array<{ pedidoItemId: string; adjudicacaoId: string; quantidade: number }>,
  tx: TransacaoBanco
) {
  for (const item of itens) {
    await tx
      .update(pedidosItens)
      .set({ quantidade: String(item.quantidade) })
      .where(eq(pedidosItens.id, item.pedidoItemId));
    await tx
      .update(comprasAdjudicacoes)
      .set({ quantidade: String(item.quantidade) })
      .where(eq(comprasAdjudicacoes.id, item.adjudicacaoId));
  }
}

export async function mudarStatusPedidoRepository(
  input: {
    pedidoId: string;
    empresaId: string;
    status: "retornado" | "confirmado";
    observacao: string;
    usuarioId: string | null;
    propostaId: string | null;
  },
  tx: TransacaoBanco
) {
  await tx.update(pedidos).set({ status: input.status }).where(eq(pedidos.id, input.pedidoId));
  await tx.insert(pedidosEventos).values({
    empresaId: input.empresaId,
    pedidoId: input.pedidoId,
    status: input.status,
    observacao: input.observacao,
    criadoPor: input.usuarioId,
    propostaId: input.propostaId
  });
}

/** A ultima resposta do fornecedor no convite: e o "autor" do evento quando ele mesmo devolve o pedido. */
export async function ultimaPropostaIdDoConviteRepository(conviteId: string, tx: TransacaoBanco) {
  const [linha] = await tx
    .select({ id: comprasPropostas.id })
    .from(comprasPropostas)
    .where(and(eq(comprasPropostas.conviteId, conviteId), eq(comprasPropostas.autorTipo, "fornecedor")))
    .orderBy(desc(comprasPropostas.versao))
    .limit(1);
  return linha?.id ?? null;
}

export async function pedidosDaListaRepository(pedidoIds: string[], db: ExecutorBanco = banco) {
  if (!pedidoIds.length) return [];
  return db.select({ id: pedidos.id, status: pedidos.status }).from(pedidos).where(inArray(pedidos.id, pedidoIds));
}
