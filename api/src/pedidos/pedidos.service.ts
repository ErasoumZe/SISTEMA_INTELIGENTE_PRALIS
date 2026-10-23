import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import type {
  PedidoDto,
  PedidoRecebimentoPayload,
  PedidoSituacaoPayload,
  PedidoStatusNovo,
  PedidosQuery
} from "@padaria/shared/pedidos";
import { empresasPermitidas, podeAcessarEmpresa } from "../auth/empresa.js";
import { executarEmTransacao } from "../banco/conexao.js";
import { erroValidacao, naoEncontrado, proibido } from "../erros.js";
import {
  atualizarSituacaoPedidoRepository,
  buscarRecebimentoPorIdempotenciaRepository,
  criarRecebimentoRepository,
  listarItensDoPedidoRepository,
  listarPedidosRepository,
  obterPedidoDetalheRepository,
  registrarDevolucaoRepository,
  registrarMovimentoRecebimentoRepository,
  travarPedidoRepository,
  travarProdutosRepository,
  type ItemDoRecebimentoGravado
} from "./pedidos.repository.js";

function validarEmpresa(perfil: PerfilUsuario, empresaId: string): void {
  if (!podeAcessarEmpresa(perfil, empresaId)) throw proibido("Empresa nao permitida", "FORBIDDEN_COMPANY");
}

export async function listarPedidos(query: PedidosQuery, perfil: PerfilUsuario): Promise<PedidoDto[]> {
  if (query.empresaId) validarEmpresa(perfil, query.empresaId);
  return listarPedidosRepository(query, empresasPermitidas(perfil));
}

export async function obterPedido(pedidoId: string, perfil: PerfilUsuario): Promise<PedidoDto> {
  const pedido = await obterPedidoDetalheRepository(pedidoId);
  if (!pedido || !podeAcessarEmpresa(perfil, pedido.empresaId)) throw naoEncontrado("Pedido nao encontrado");
  return pedido;
}

// Depois do E8 o unico ato manual e CANCELAR. Pedido legado (a fazer, enviado, retornado) nao tem mais
// como ser confirmado, editado nem enviado: so receber (se confirmado) ou cancelar. "Confirmado" nasce da
// rodada, pela compra automatica ou pela excecao do comprador.
const transicoesPermitidas: Record<string, PedidoStatusNovo[]> = {
  a_fazer: ["cancelado"],
  enviado: ["cancelado"],
  retornado: ["cancelado"],
  confirmado: ["cancelado"],
  recebido_parcial: ["cancelado"],
  recebido: [],
  cancelado: []
};

export async function alterarSituacaoPedido(
  pedidoId: string,
  payload: PedidoSituacaoPayload,
  perfil: PerfilUsuario
): Promise<void> {
  await executarEmTransacao(async (tx) => {
    const pedido = await travarPedidoRepository(pedidoId, tx);
    if (!pedido || !podeAcessarEmpresa(perfil, pedido.empresaId)) throw naoEncontrado("Pedido nao encontrado");
    if (!transicoesPermitidas[pedido.status]?.includes(payload.status)) {
      throw erroValidacao("Transicao de situacao nao permitida para este pedido", "TRANSICAO_PEDIDO_INVALIDA");
    }
    await atualizarSituacaoPedidoRepository(
      {
        pedidoId,
        empresaId: pedido.empresaId,
        status: payload.status,
        observacao: payload.observacao ?? null,
        criadoPor: perfil.usuarioId
      },
      tx
    );
  });
}

export async function receberPedido(
  pedidoId: string,
  payload: PedidoRecebimentoPayload,
  perfil: PerfilUsuario
): Promise<{ recebimentoId: string; duplicado: boolean; status: "recebido_parcial" | "recebido" }> {
  return executarEmTransacao(async (tx) => {
    const pedido = await travarPedidoRepository(pedidoId, tx);
    if (!pedido || !podeAcessarEmpresa(perfil, pedido.empresaId)) throw naoEncontrado("Pedido nao encontrado");
    const repetido = await buscarRecebimentoPorIdempotenciaRepository(pedido.empresaId, payload.idempotenciaChave, tx);
    if (repetido) {
      if (repetido.pedidoId !== pedidoId)
        throw erroValidacao("Chave de recebimento ja usada para outro pedido", "IDEMPOTENCIA_CONFLITO");
      if (!mesmaIntencaoRecebimento(repetido, payload)) {
        throw erroValidacao("Chave de recebimento reutilizada com dados diferentes", "IDEMPOTENCIA_CONFLITO");
      }
      return {
        recebimentoId: repetido.id,
        duplicado: true,
        status: pedido.status === "recebido" ? "recebido" : "recebido_parcial"
      };
    }

    if (pedido.status !== "confirmado" && pedido.status !== "recebido_parcial") {
      throw erroValidacao("So pedido confirmado pode ser recebido", "PEDIDO_NAO_RECEBIVEL");
    }

    const itensPedido = await listarItensDoPedidoRepository(pedidoId, tx);
    const itensPorId = new Map(itensPedido.map((item) => [item.id, item]));
    if (new Set(payload.itens.map((item) => item.pedidoItemId)).size !== payload.itens.length) {
      throw erroValidacao(
        "Um item nao pode ser conferido duas vezes no mesmo recebimento",
        "ITEM_RECEBIMENTO_DUPLICADO"
      );
    }
    for (const itemRecebido of payload.itens) {
      const itemPedido = itensPorId.get(itemRecebido.pedidoItemId);
      if (!itemPedido || !itemPedido.produtoId)
        throw erroValidacao("Item do pedido nao encontrado", "ITEM_PEDIDO_INVALIDO");
      // Recebido + devolvido nunca passa do que falta chegar (doc 58 §7: chegaram 2, 1 estragado = 1 + 1).
      if (itemRecebido.quantidadeConferida + itemRecebido.quantidadeDevolvida > Number(itemPedido.quantidadePendente)) {
        throw erroValidacao(
          `Recebido e devolvido ultrapassam o pendente de ${itemPedido.descricaoProduto}`,
          "RECEBIMENTO_ACIMA_PEDIDO"
        );
      }
    }

    const recebimentoId = await criarRecebimentoRepository(
      {
        empresaId: pedido.empresaId,
        pedidoId,
        observacao: payload.observacao ?? null,
        idempotenciaChave: payload.idempotenciaChave,
        recebidoPor: perfil.usuarioId
      },
      tx
    );
    if (!recebimentoId) {
      const vencedor = await buscarRecebimentoPorIdempotenciaRepository(
        pedido.empresaId,
        payload.idempotenciaChave,
        tx
      );
      if (!vencedor) throw new Error("Recebimento nao criado");
      if (vencedor.pedidoId !== pedidoId) {
        throw erroValidacao("Chave de recebimento ja usada para outro pedido", "IDEMPOTENCIA_CONFLITO");
      }
      if (!mesmaIntencaoRecebimento(vencedor, payload)) {
        throw erroValidacao("Chave de recebimento reutilizada com dados diferentes", "IDEMPOTENCIA_CONFLITO");
      }
      return { recebimentoId: vencedor.id, duplicado: true, status: "recebido_parcial" };
    }

    // So o recebido entra no estoque: trava apenas os produtos que vao receber quantidade.
    const entrando = payload.itens.filter((item) => item.quantidadeConferida > 0);
    const produtosTravados = await travarProdutosRepository(
      pedido.empresaId,
      entrando.map((item) => itensPorId.get(item.pedidoItemId)?.produtoId ?? ""),
      tx
    );
    const saldos = new Map(produtosTravados.map((produto) => [produto.id, produto.quantidadeEstoque]));
    if (saldos.size !== new Set(entrando.map((item) => itensPorId.get(item.pedidoItemId)?.produtoId)).size) {
      throw erroValidacao("Produto do pedido nao pertence a empresa", "INVALID_PRODUCT");
    }

    for (const itemRecebido of payload.itens) {
      if (itemRecebido.quantidadeDevolvida <= 0) continue;
      const itemPedido = itensPorId.get(itemRecebido.pedidoItemId)!;
      await registrarDevolucaoRepository(
        {
          empresaId: pedido.empresaId,
          pedidoId,
          pedidoItemId: itemPedido.id,
          pedidoRecebimentoId: recebimentoId,
          quantidade: itemRecebido.quantidadeDevolvida,
          motivo: itemRecebido.motivoDevolucao!,
          devolvidoPor: perfil.usuarioId
        },
        tx
      );
      itemPedido.quantidadeDevolvida = String(
        Number(itemPedido.quantidadeDevolvida) + itemRecebido.quantidadeDevolvida
      );
    }

    for (const itemRecebido of entrando) {
      const itemPedido = itensPorId.get(itemRecebido.pedidoItemId)!;
      const produtoId = itemPedido.produtoId!;
      const saldoAnterior = saldos.get(produtoId)!;
      const saldoPosterior = saldoAnterior + itemRecebido.quantidadeConferida;
      await registrarMovimentoRecebimentoRepository(
        {
          empresaId: pedido.empresaId,
          pedidoItemId: itemPedido.id,
          pedidoRecebimentoId: recebimentoId,
          produtoId,
          quantidade: itemRecebido.quantidadeConferida,
          saldoAnterior,
          saldoPosterior
        },
        tx
      );
      saldos.set(produtoId, saldoPosterior);
      itemPedido.quantidadeRecebida = String(Number(itemPedido.quantidadeRecebida) + itemRecebido.quantidadeConferida);
    }
    // Devolveu, fechou o item (doc 58 §7); sem devolucao, o que falta continua pendente.
    for (const itemPedido of itensPedido)
      itemPedido.quantidadePendente = String(
        Number(itemPedido.quantidadeDevolvida) > 0
          ? 0
          : Number(itemPedido.quantidade) - Number(itemPedido.quantidadeRecebida)
      );

    const status: "recebido_parcial" | "recebido" = itensPedido.every((item) => Number(item.quantidadePendente) === 0)
      ? "recebido"
      : "recebido_parcial";
    await atualizarSituacaoPedidoRepository(
      {
        pedidoId,
        empresaId: pedido.empresaId,
        status,
        observacao: payload.observacao ?? null,
        criadoPor: perfil.usuarioId
      },
      tx
    );
    return { recebimentoId, duplicado: false, status };
  });
}

type IntencaoItem = Omit<ItemDoRecebimentoGravado, "motivoDevolucao"> & { motivoDevolucao?: string | null | undefined };

function mesmaIntencaoRecebimento(
  gravado: { observacao: string | null; itens: IntencaoItem[] },
  recebido: PedidoRecebimentoPayload
): boolean {
  const assinatura = (itens: IntencaoItem[]) =>
    [...itens]
      .sort((a, b) => a.pedidoItemId.localeCompare(b.pedidoItemId))
      .map((item) => {
        const motivo = item.quantidadeDevolvida > 0 ? (item.motivoDevolucao ?? "") : "";
        return `${item.pedidoItemId}:${item.quantidadeConferida}:${item.quantidadeDevolvida}:${motivo}`;
      })
      .join("|");
  return (
    (gravado.observacao ?? "") === (recebido.observacao ?? "") &&
    assinatura(gravado.itens) === assinatura(recebido.itens)
  );
}
