// MODULO DO COMPRADOR — orquestra a compra automatica (Fase 2, decisoes 1/5/12/14). Disparado pelo
// controller publico logo apos a resposta do fornecedor ser gravada. NAO e importado pelo modulo
// publico (isolamento). Transacao propria, serializada pela advisory da rodada.
import { calcularCustoFinal, quantidadeDentroDaMargem, type ItemParaCusto } from "@padaria/shared/compras";
import { sqlTravarRodadaDeCompras } from "@padaria/db/sessao";
import { executarEmTransacao } from "../banco/conexao.js";
import { falhaTecnica } from "../erros.js";
import { criarNotificacoesRepository } from "../notificacoes/notificacoes.repository.js";
import { ultimaVersaoEnviadaDoConviteRepository } from "./compras-decisao.repository.js";
import { travarRodadaRepository } from "./compras-fechamento.repository.js";
import {
  carregarPropostaParaAdjudicacaoRepository,
  conviteItensCompradosRepository,
  marcarConviteAguardandoCompradorRepository,
  criarPedidoCompradoRepository,
  gravarCustoPropostaItemRepository,
  inserirAdjudicacaoRepository,
  inserirItemPedidoRepository,
  pedidoAbertoDaRodadaRepository,
  rodadaItensAdjudicadosRepository,
  somaAutomaticaDaRodadaRepository
} from "./compras-adjudicacao.repository.js";
import { enfileirarAvisoDeCompra } from "./compras-whatsapp.service.js";

export type ResultadoCompraAutomatica = { comprados: number; pendentes: number };

/**
 * Processa a compra automatica da ULTIMA resposta de um fornecedor. Item com custo final <= preco-base
 * congelado, dentro do teto e da margem de quantidade nasce comprado e COTADO (doc 57: o fornecedor ainda
 * ajusta a quantidade real na separacao e o comprador confirma); o resto
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
    // O status lido na carga pode estar velho: o fechamento por prazo pode ter commitado enquanto esta
    // transacao esperava a trava. Reler SOB a trava e a unica leitura que decide.
    const rodadaAtual = await travarRodadaRepository(proposta.rodadaId, tx);
    if (!rodadaAtual || rodadaAtual.status !== "aberta") return { comprados: 0, pendentes: 0 };
    // So a ULTIMA resposta compra: uma versao antiga, processada depois da nova, compraria uma oferta
    // que o fornecedor ja retirou.
    if (proposta.versao < (await ultimaVersaoEnviadaDoConviteRepository(proposta.conviteId, tx))) {
      return { comprados: 0, pendentes: 0 };
    }

    const adjudicados = await rodadaItensAdjudicadosRepository(proposta.rodadaId, tx);
    // Ordem fixa (id do item): com teto, QUAIS itens cabem nao pode depender da ordem fisica das linhas.
    const livres = proposta.itens
      .filter((item) => !adjudicados.has(item.rodadaItemId) && !item.indisponivel && item.valorUnitario !== null)
      .sort((a, b) => a.rodadaItemId.localeCompare(b.rodadaItemId));
    if (!livres.length) return { comprados: 0, pendentes: 0 };

    // Doc 57 (margem): o fornecedor responde quanto TEM. Vale o que ele tem se estiver dentro da margem da
    // rodada (para menos e para mais); fora dela, o item nao e comprado sozinho.
    const quantidadeDe = (item: (typeof livres)[number]) =>
      item.quantidadeDisponivel === null ? Number(item.quantidade) : Number(item.quantidadeDisponivel);
    const dentroDaMargem = (item: (typeof livres)[number]) =>
      quantidadeDentroDaMargem(Number(item.quantidade), quantidadeDe(item), proposta.margemVariacaoPercentual);
    const entrada: ItemParaCusto[] = livres.map((item) => ({
      ref: item.rodadaItemId,
      valorUnitario: Number(item.valorUnitario),
      quantidade: quantidadeDe(item),
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

    // Teto em centavos inteiros: em ponto flutuante (0.1 + 0.2 <= 0.3 e falso) um item que cabe
    // exatamente no teto seria barrado.
    const tetoCentavos = proposta.tetoValor === null ? null : Math.round(Number(proposta.tetoValor) * 100);
    let acumulado =
      tetoCentavos === null ? 0 : Math.round((await somaAutomaticaDaRodadaRepository(proposta.rodadaId, tx)) * 100);
    let pedidoId: string | null = null;
    let comprados = 0;
    let pendentes = 0;

    for (const item of livres) {
      const custo = custoPorRodadaItem.get(item.rodadaItemId)!;
      const quantidade = quantidadeDe(item);
      const totalItem = Math.round(custo.custoFinalUnitario * quantidade * 100);
      const cabeNoTeto = tetoCentavos === null || acumulado + totalItem <= tetoCentavos;
      if (!custo.compraAutomatica || !cabeNoTeto || !dentroDaMargem(item)) {
        pendentes += 1;
        continue;
      }
      if (!pedidoId) {
        pedidoId =
          (await pedidoAbertoDaRodadaRepository(proposta.rodadaId, proposta.fornecedorId, tx)) ??
          (await criarPedidoCompradoRepository(
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
          quantidade: String(quantidade),
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
          quantidade: String(quantidade),
          custoFinalUnitario: custo.custoFinalUnitario,
          precoBaseValor: item.precoBaseValor,
          modo: "automatica",
          aprovadoPor: null
        },
        tx
      );
      // Quebra de invariante, nunca caminho normal (a advisory ja garante a exclusividade): desfaz o
      // pedido e o item recem-criados em vez de deixar item de pedido sem adjudicacao. A resposta do
      // fornecedor ja esta gravada; o chamador publico loga e o item cai na decisao.
      if (!venceu) throw falhaTecnica("Item da rodada ja tinha vencedor apesar da trava");
      acumulado += totalItem;
      comprados += 1;
    }

    // Doc 58 §6: comprou, o fornecedor fica sabendo pelo WhatsApp (pode separar e entregar).
    if (pedidoId) await enfileirarAvisoDeCompra(pedidoId, tx);
    // O comprador ve na lista de convites quem esta esperando por ele.
    if (pendentes > 0) await marcarConviteAguardandoCompradorRepository(proposta.conviteId, tx);

    if (comprados > 0 || pendentes > 0) {
      // Decisao 14: TODA compra automatica cai no sino do Comprador na hora (nao so o que sobrou), e o
      // que ela nao resolveu tambem. Uma linha por rodada; cada resposta reabre com o titulo atual.
      const titulo =
        comprados > 0 && pendentes > 0
          ? `Rodada de compra: ${comprados} item(ns) comprado(s) automaticamente, ${pendentes} para decidir`
          : comprados > 0
            ? `Compra automática: ${comprados} item(ns) comprado(s) na rodada`
            : "Rodada de compra com itens para decidir";
      await criarNotificacoesRepository(
        {
          empresaId: proposta.empresaId,
          tipo: "compras_decisao_pendente",
          destinatariosUsuarioIds: [proposta.abertaPor],
          referenciaId: proposta.rodadaId,
          titulo,
          reabrir: true
        },
        tx
      );
    }

    return { comprados, pendentes };
  });
}

/** Quais itens do convite ja foram comprados (so os ids). O controller publico injeta isto na leitura do fornecedor. */
export function itensCompradosDoConvite(conviteId: string): Promise<Set<string>> {
  return conviteItensCompradosRepository(conviteId);
}
