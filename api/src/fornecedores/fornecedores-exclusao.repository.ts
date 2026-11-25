// Exclusao de fornecedor com "compra sem efeito" (decisao do Jose, 25/11/2026).
//
// Sai junto o que e so negociacao: convites de cotacao (com respostas e envios de WhatsApp) e os
// pedidos que NUNCA foram recebidos (com itens, eventos, cotacao antiga por link e adjudicacoes da
// compra automatica). Fica bloqueado o que ja virou dinheiro, estoque ou historico de preco: despesa,
// mercadoria, retirada, nota fiscal, historico de preco, e pedido com recebimento, devolucao ou
// movimento de estoque. Solicitacoes, rodadas e preco-base sao da padaria e nao sao tocados.
import { and, eq, inArray, or } from "drizzle-orm";
import {
  comprasAdjudicacoes,
  comprasHistoricoImportacaoItens,
  comprasHistoricoPrecos,
  comprasPropostas,
  comprasRodadasConvites,
  despesas,
  estoqueMovimentos,
  fornecedores,
  mercadorias,
  notasFiscais,
  pedidos,
  pedidosCotacoes,
  pedidosCotacoesItens,
  pedidosDevolucoes,
  pedidosEventos,
  pedidosItens,
  pedidosRecebimentos,
  retiradas
} from "@padaria/db/schema";
import type { TransacaoBanco } from "../banco/conexao.js";

/** Trava o fornecedor e as compras dele (pedidos e convites) para a exclusao nao correr junto de um
 * recebimento ou de uma resposta de cotacao. Devolve null se o fornecedor nao existe nesta empresa. */
export async function travarFornecedorParaExclusaoRepository(id: string, empresaId: string, tx: TransacaoBanco) {
  const [fornecedor] = await tx
    .select({ id: fornecedores.id })
    .from(fornecedores)
    .where(and(eq(fornecedores.id, id), eq(fornecedores.empresaId, empresaId)))
    .for("update");
  if (!fornecedor) return null;
  const pedidosIds = (
    await tx
      .select({ id: pedidos.id })
      .from(pedidos)
      .where(and(eq(pedidos.fornecedorId, id), eq(pedidos.empresaId, empresaId)))
      .for("update")
  ).map((linha) => linha.id);
  const convitesIds = (
    await tx
      .select({ id: comprasRodadasConvites.id })
      .from(comprasRodadasConvites)
      .where(and(eq(comprasRodadasConvites.fornecedorId, id), eq(comprasRodadasConvites.empresaId, empresaId)))
      .for("update")
  ).map((linha) => linha.id);
  return { pedidosIds, convitesIds };
}

const existe = async (consulta: Promise<Array<{ id: string }>>) => (await consulta).length > 0;

/** O que impede a exclusao, em linguagem de tela. Vazio = pode excluir. */
export async function bloqueiosDaExclusaoRepository(
  id: string,
  empresaId: string,
  pedidosIds: string[],
  tx: TransacaoBanco
): Promise<string[]> {
  const bloqueios: string[] = [];
  const temDespesa = await existe(
    tx
      .select({ id: despesas.id })
      .from(despesas)
      .where(and(eq(despesas.fornecedorId, id), eq(despesas.empresaId, empresaId)))
      .limit(1)
  );
  if (temDespesa) bloqueios.push("despesa");
  const temMercadoria = await existe(
    tx
      .select({ id: mercadorias.id })
      .from(mercadorias)
      .where(and(eq(mercadorias.fornecedorId, id), eq(mercadorias.empresaId, empresaId)))
      .limit(1)
  );
  if (temMercadoria) bloqueios.push("mercadoria");
  const temRetirada = await existe(
    tx
      .select({ id: retiradas.id })
      .from(retiradas)
      .where(and(eq(retiradas.fornecedorId, id), eq(retiradas.empresaId, empresaId)))
      .limit(1)
  );
  if (temRetirada) bloqueios.push("retirada");
  const temNota = await existe(
    tx
      .select({ id: notasFiscais.id })
      .from(notasFiscais)
      .where(and(eq(notasFiscais.fornecedorId, id), eq(notasFiscais.empresaId, empresaId)))
      .limit(1)
  );
  if (temNota) bloqueios.push("nota fiscal");

  const temHistorico =
    (await existe(
      tx
        .select({ id: comprasHistoricoPrecos.id })
        .from(comprasHistoricoPrecos)
        .where(and(eq(comprasHistoricoPrecos.fornecedorId, id), eq(comprasHistoricoPrecos.empresaId, empresaId)))
        .limit(1)
    )) ||
    (await existe(
      tx
        .select({ id: comprasHistoricoImportacaoItens.id })
        .from(comprasHistoricoImportacaoItens)
        .where(eq(comprasHistoricoImportacaoItens.fornecedorId, id))
        .limit(1)
    ));
  if (temHistorico) bloqueios.push("historico de preco");

  if (pedidosIds.length) {
    const itensIds = (
      await tx.select({ id: pedidosItens.id }).from(pedidosItens).where(inArray(pedidosItens.pedidoId, pedidosIds))
    ).map((linha) => linha.id);
    let recebido =
      (await existe(
        tx
          .select({ id: pedidosRecebimentos.id })
          .from(pedidosRecebimentos)
          .where(inArray(pedidosRecebimentos.pedidoId, pedidosIds))
          .limit(1)
      )) ||
      (await existe(
        tx
          .select({ id: pedidosDevolucoes.id })
          .from(pedidosDevolucoes)
          .where(inArray(pedidosDevolucoes.pedidoId, pedidosIds))
          .limit(1)
      ));
    if (!recebido && itensIds.length) {
      recebido =
        (await existe(
          tx
            .select({ id: estoqueMovimentos.id })
            .from(estoqueMovimentos)
            .where(inArray(estoqueMovimentos.pedidoItemId, itensIds))
            .limit(1)
        )) ||
        (await existe(
          tx
            .select({ id: comprasHistoricoPrecos.id })
            .from(comprasHistoricoPrecos)
            .where(inArray(comprasHistoricoPrecos.pedidoItemId, itensIds))
            .limit(1)
        ));
    }
    if (recebido) bloqueios.push("pedido recebido");
  }
  return bloqueios;
}

/** Apaga a compra sem efeito e o proprio fornecedor, na ordem que as FKs restrict exigem. So chamar
 * depois de `bloqueiosDaExclusaoRepository` voltar vazio, dentro da mesma transacao. */
export async function apagarFornecedorComComprasRepository(
  input: { id: string; empresaId: string; pedidosIds: string[]; convitesIds: string[] },
  tx: TransacaoBanco
): Promise<void> {
  const { id, empresaId, pedidosIds, convitesIds } = input;
  const propostasIds = convitesIds.length
    ? (
        await tx
          .select({ id: comprasPropostas.id })
          .from(comprasPropostas)
          .where(inArray(comprasPropostas.conviteId, convitesIds))
      ).map((linha) => linha.id)
    : [];

  // 1. Adjudicacoes da compra automatica (apontam para pedido, item do pedido e proposta).
  await tx
    .delete(comprasAdjudicacoes)
    .where(and(eq(comprasAdjudicacoes.fornecedorId, id), eq(comprasAdjudicacoes.empresaId, empresaId)));

  if (pedidosIds.length) {
    // 2. Eventos dos pedidos (e os que tem uma proposta dele como autor).
    await tx
      .delete(pedidosEventos)
      .where(
        propostasIds.length
          ? or(inArray(pedidosEventos.pedidoId, pedidosIds), inArray(pedidosEventos.propostaId, propostasIds))
          : inArray(pedidosEventos.pedidoId, pedidosIds)
      );
    // 3. Cotacao antiga por link (R-216) desses pedidos.
    const cotacoesIds = (
      await tx
        .select({ id: pedidosCotacoes.id })
        .from(pedidosCotacoes)
        .where(inArray(pedidosCotacoes.pedidoId, pedidosIds))
    ).map((linha) => linha.id);
    if (cotacoesIds.length) {
      await tx.delete(pedidosCotacoesItens).where(inArray(pedidosCotacoesItens.cotacaoId, cotacoesIds));
      await tx.delete(pedidosCotacoes).where(inArray(pedidosCotacoes.id, cotacoesIds));
    }
    // 4. Os pedidos (itens e envios de WhatsApp saem por cascade).
    await tx.delete(pedidos).where(inArray(pedidos.id, pedidosIds));
  } else if (propostasIds.length) {
    await tx.delete(pedidosEventos).where(inArray(pedidosEventos.propostaId, propostasIds));
  }

  if (convitesIds.length) {
    // 5. Propostas antes dos convites: o item da proposta aponta (restrict) para o item do convite.
    if (propostasIds.length) await tx.delete(comprasPropostas).where(inArray(comprasPropostas.id, propostasIds));
    // 6. Convites (itens do convite e envios de WhatsApp saem por cascade).
    await tx.delete(comprasRodadasConvites).where(inArray(comprasRodadasConvites.id, convitesIds));
  }

  // 7. O fornecedor (catalogo fornecedor-produto e apelidos saem por cascade).
  await tx.delete(fornecedores).where(and(eq(fornecedores.id, id), eq(fornecedores.empresaId, empresaId)));
}
