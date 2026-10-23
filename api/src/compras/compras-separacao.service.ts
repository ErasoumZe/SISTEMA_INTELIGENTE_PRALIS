import {
  limitesDaMargem,
  quantidadeDentroDaMargem,
  separacaoPublicaPayloadSchema,
  type PedidoPublicoDto
} from "@padaria/shared/compras";
import type { DadosExternos } from "@padaria/shared/api";
import { executarEmTransacao } from "../banco/conexao.js";
import { conflito, erroValidacao, naoEncontrado, naoProcessavel } from "../erros.js";
import { criarNotificacoesRepository } from "../notificacoes/notificacoes.repository.js";
import { formatarQuantidade } from "./texto-quantidade.js";
import {
  ajustarQuantidadesRepository,
  itensDoPedidoDaRodadaRepository,
  pedidoDoConviteRepository,
  registrarEventoDoPedidoRepository,
  travarPedidoRepository,
  ultimaPropostaIdDoConviteRepository
} from "./compras-separacao.repository.js";

// Doc 58 §6 (Rodrigo, 23/10): o preco aceito compra na hora (Comprado). Depois disso o FORNECEDOR ajusta a
// quantidade ao que tem em estoque (pediu 5 kg, separou 5,2 kg), pelo mesmo link, dentro da margem, sem nova
// aprovacao; o comprador ve o ajuste no pedido. Vale enquanto nada foi recebido.

const STATUS_PUBLICOS = new Set(["cotado", "retornado", "confirmado", "recebido_parcial", "recebido"]);

/** O que o fornecedor ganhou nesta cotacao, para a pagina publica. Injetado pelo controller publico. */
export async function pedidoPublicoDoConvite(conviteId: string): Promise<PedidoPublicoDto | null> {
  const pedido = await pedidoDoConviteRepository(conviteId);
  if (!pedido || !STATUS_PUBLICOS.has(pedido.status)) return null;
  const itens = await itensDoPedidoDaRodadaRepository(pedido.pedidoId);
  return {
    status: pedido.status as PedidoPublicoDto["status"],
    margemVariacaoPercentual: pedido.margemVariacaoPercentual,
    itens: itens.map((item) => {
      const limites =
        pedido.margemVariacaoPercentual === null
          ? null
          : limitesDaMargem(Number(item.quantidadePedida), pedido.margemVariacaoPercentual);
      return {
        pedidoItemId: item.pedidoItemId,
        descricaoProduto: item.descricaoProduto,
        quantidadePedida: item.quantidadePedida,
        quantidade: item.quantidade,
        valorUnitario: item.valorUnitario,
        minimo: limites ? String(limites.minimo) : null,
        maximo: limites ? String(limites.maximo) : null
      };
    })
  };
}

/** O fornecedor ajusta a quantidade de cada item comprado ao que tem em estoque (dentro da margem). */
export async function registrarSeparacao(conviteId: string, body: DadosExternos): Promise<void> {
  const payload = separacaoPublicaPayloadSchema.parse(body ?? {});
  const pedido = await pedidoDoConviteRepository(conviteId);
  if (!pedido) throw naoEncontrado("Nenhum pedido seu nesta cotacao", "PEDIDO_NAO_ENCONTRADO");
  await executarEmTransacao(async (tx) => {
    const travado = await travarPedidoRepository(pedido.pedidoId, tx);
    if (!travado || travado.status !== "confirmado")
      throw conflito("Este pedido ja comecou a ser recebido ou foi cancelado", "PEDIDO_NAO_AJUSTAVEL");
    const itens = await itensDoPedidoDaRodadaRepository(pedido.pedidoId, tx);
    const porId = new Map(itens.map((item) => [item.pedidoItemId, item]));
    if (new Set(payload.itens.map((item) => item.pedidoItemId)).size !== payload.itens.length)
      throw erroValidacao("Item repetido", "ITEM_DUPLICADO");
    const mudancas: string[] = [];
    const ajustes = payload.itens.map((informado) => {
      const item = porId.get(informado.pedidoItemId);
      if (!item) throw erroValidacao("Item nao e deste pedido", "ITEM_FORA_DO_PEDIDO");
      if (
        !quantidadeDentroDaMargem(Number(item.quantidadePedida), informado.quantidade, pedido.margemVariacaoPercentual)
      ) {
        const { minimo, maximo } = limitesDaMargem(Number(item.quantidadePedida), pedido.margemVariacaoPercentual);
        throw naoProcessavel(
          `${item.descricaoProduto}: a quantidade precisa ficar entre ${minimo} e ${maximo}`,
          "QUANTIDADE_FORA_DA_MARGEM"
        );
      }
      if (Number(item.quantidade) !== informado.quantidade)
        mudancas.push(
          `${item.descricaoProduto}: ${formatarQuantidade(item.quantidade)} → ${formatarQuantidade(informado.quantidade)}`
        );
      return { pedidoItemId: item.pedidoItemId, adjudicacaoId: item.adjudicacaoId, quantidade: informado.quantidade };
    });
    if (!mudancas.length) return;
    await ajustarQuantidadesRepository(ajustes, tx);
    await registrarEventoDoPedidoRepository(
      {
        pedidoId: pedido.pedidoId,
        empresaId: pedido.empresaId,
        status: "confirmado",
        observacao: `Fornecedor ajustou ao estoque dele: ${mudancas.join("; ")}`,
        usuarioId: null,
        propostaId: await ultimaPropostaIdDoConviteRepository(conviteId, tx)
      },
      tx
    );
    await criarNotificacoesRepository(
      {
        empresaId: pedido.empresaId,
        tipo: "compras_decisao_pendente",
        destinatariosUsuarioIds: [pedido.abertaPor],
        referenciaId: pedido.rodadaId,
        titulo: "Fornecedor ajustou a quantidade de um pedido comprado",
        reabrir: true
      },
      tx
    );
  });
}
