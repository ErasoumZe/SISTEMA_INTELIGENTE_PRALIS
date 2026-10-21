// MODULO DO COMPRADOR — orquestra a compra automatica (Fase 2, decisoes 1/5/12/14). Disparado pelo
// controller publico logo apos a resposta do fornecedor ser gravada. NAO e importado pelo modulo
// publico (isolamento). Transacao propria, serializada pela advisory da rodada.
import { calcularCustoFinal, type ItemParaCusto } from "@padaria/shared/compras";
import { sqlTravarRodadaDeCompras } from "@padaria/db/sessao";
import { executarEmTransacao } from "../banco/conexao.js";
import { criarNotificacoesRepository } from "../notificacoes/notificacoes.repository.js";
import {
  carregarPropostaParaAdjudicacaoRepository,
  criarPedidoConfirmadoRepository,
  gravarCustoPropostaItemRepository,
  inserirAdjudicacaoRepository,
  inserirItemPedidoRepository,
  pedidoConfirmadoDaRodadaRepository,
  rodadaItensAdjudicadosRepository,
  somaAutomaticaDaRodadaRepository
} from "./compras-adjudicacao.repository.js";

export type ResultadoCompraAutomatica = { comprados: number; pendentes: number };

/**
 * Processa a compra automatica da ULTIMA resposta de um fornecedor. Item com custo final <= preco-base
 * congelado e dentro do teto nasce comprado e confirmado (pedido consolidado por fornecedor); o resto
 * (acima da base, sem base, ou barrado pelo teto) vira pendencia no sino do Comprador.
 *
 * Nunca lanca para o chamador publico: a resposta do fornecedor ja foi gravada e nao pode ser perdida
 * por uma falha na adjudicacao (o item apenas cai para decisao no fechamento). O controller ignora o
 * retorno; ele existe para teste.
 */
export async function processarCompraAutomatica(propostaId: string): Promise<ResultadoCompraAutomatica> {
  return executarEmTransacao(async (tx) => {
    const proposta = await carregarPropostaParaAdjudicacaoRepository(propostaId, tx);
    if (!proposta) return { comprados: 0, pendentes: 0 };
    // Ordem canonica: advisory por solicitacao antes de ler o que decide a corrida.
    await tx.execute(sqlTravarRodadaDeCompras(proposta.solicitacaoId));
    if (proposta.rodadaStatus !== "aberta") return { comprados: 0, pendentes: 0 };

    const adjudicados = await rodadaItensAdjudicadosRepository(proposta.rodadaId, tx);
    const livres = proposta.itens.filter(
      (item) => !adjudicados.has(item.rodadaItemId) && !item.indisponivel && item.valorUnitario !== null
    );
    if (!livres.length) return { comprados: 0, pendentes: 0 };

    const entrada: ItemParaCusto[] = livres.map((item) => ({
      ref: item.rodadaItemId,
      valorUnitario: Number(item.valorUnitario),
      quantidade: Number(item.quantidade),
      precoBaseValor: item.precoBaseValor === null ? null : Number(item.precoBaseValor)
    }));
    const custos = calcularCustoFinal(entrada, Number(proposta.frete ?? 0));
    const custoPorRodadaItem = new Map(custos.map((custo) => [custo.ref, custo]));

    // Custo final e GRAVADO em todo item livre precificado, comprado ou nao (decisao: nao recalcular
    // na leitura).
    for (const item of livres) {
      const custo = custoPorRodadaItem.get(item.rodadaItemId)!;
      await gravarCustoPropostaItemRepository(
        {
          propostaItemId: item.propostaItemId,
          freteRateado: custo.freteRateado,
          custoFinalUnitario: custo.custoFinalUnitario
        },
        tx
      );
    }

    const teto = proposta.tetoValor === null ? null : Number(proposta.tetoValor);
    let acumulado = teto === null ? 0 : await somaAutomaticaDaRodadaRepository(proposta.rodadaId, tx);
    let pedidoId: string | null = null;
    let comprados = 0;
    let pendentes = 0;

    for (const item of livres) {
      const custo = custoPorRodadaItem.get(item.rodadaItemId)!;
      const quantidade = Number(item.quantidade);
      const totalItem = custo.custoFinalUnitario * quantidade;
      const cabeNoTeto = teto === null || acumulado + totalItem <= teto;
      if (!custo.compraAutomatica || !cabeNoTeto) {
        pendentes += 1;
        continue;
      }
      if (!pedidoId) {
        pedidoId =
          (await pedidoConfirmadoDaRodadaRepository(proposta.rodadaId, proposta.fornecedorId, tx)) ??
          (await criarPedidoConfirmadoRepository(
            {
              empresaId: proposta.empresaId,
              solicitacaoId: proposta.solicitacaoId,
              rodadaId: proposta.rodadaId,
              fornecedorId: proposta.fornecedorId,
              propostaId: proposta.propostaId,
              abertaPor: proposta.abertaPor
            },
            tx
          ));
      }
      const pedidoItemId = await inserirItemPedidoRepository(
        {
          pedidoId,
          fornecedorId: proposta.fornecedorId,
          produtoId: item.produtoId,
          descricaoProduto: item.descricaoProduto,
          quantidade: item.quantidade,
          estoqueAtual: item.estoqueAtual,
          estoqueMin: item.estoqueMin,
          estoqueMax: item.estoqueMax
        },
        tx
      );
      const venceu = await inserirAdjudicacaoRepository(
        {
          empresaId: proposta.empresaId,
          rodadaItemId: item.rodadaItemId,
          propostaItemId: item.propostaItemId,
          fornecedorId: proposta.fornecedorId,
          pedidoId,
          pedidoItemId,
          quantidade: item.quantidade,
          custoFinalUnitario: custo.custoFinalUnitario,
          precoBaseValor: item.precoBaseValor
        },
        tx
      );
      if (venceu) {
        acumulado += totalItem;
        comprados += 1;
      } else {
        // Corrida: outro ganhou o item apesar da trava (defensivo). O item do pedido fica orfao de
        // adjudicacao — aceitavel: o pedido e consolidado e nenhuma entrada de estoque ocorreu ainda.
        pendentes += 1;
      }
    }

    if (pendentes > 0) {
      // Decisao 14: o que a compra automatica nao resolveu cai no sino do Comprador na hora.
      await criarNotificacoesRepository(
        {
          empresaId: proposta.empresaId,
          tipo: "compras_decisao_pendente",
          destinatariosUsuarioIds: [proposta.abertaPor],
          referenciaId: proposta.rodadaId,
          titulo: "Rodada de compra com itens para decidir",
          reabrir: true
        },
        tx
      );
    }

    return { comprados, pendentes };
  });
}
