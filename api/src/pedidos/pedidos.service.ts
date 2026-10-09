import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import type {
  GerarPedidoAutomaticoPayload,
  PedidoDto,
  PedidoEdicaoPayload,
  PedidoPayload,
  PedidoRecebimentoPayload,
  PedidoSituacaoPayload,
  PedidoStatusNovo,
  PedidosQuery
} from "@padaria/shared/pedidos";
import { gerarItensReposicao } from "@padaria/shared/pedidos";
import { empresasPermitidas, podeAcessarEmpresa } from "../auth/empresa.js";
import { executarEmTransacao } from "../banco/conexao.js";
import { erroValidacao, naoEncontrado, proibido } from "../erros.js";
import {
  atualizarPedidoRepository,
  atualizarSituacaoPedidoRepository,
  buscarPedidoBaseRepository,
  buscarProdutosEstoqueRepository,
  buscarRecebimentoPorIdempotenciaRepository,
  criarPedidoRepository,
  criarRecebimentoRepository,
  fornecedorPertenceAEmpresaRepository,
  listarItensDoPedidoRepository,
  listarPedidosRepository,
  obterPedidoDetalheRepository,
  registrarMovimentoRecebimentoRepository,
  travarPedidoRepository,
  travarProdutosRepository,
  type ItemPedidoParaCriar,
  type ProdutoEstoqueLinha
} from "./pedidos.repository.js";

function validarEmpresa(perfil: PerfilUsuario, empresaId: string): void {
  if (!podeAcessarEmpresa(perfil, empresaId)) throw proibido("Empresa nao permitida", "FORBIDDEN_COMPANY");
}

function validarItensSemDuplicidade(itens: Array<{ produtoId: string }>): void {
  if (new Set(itens.map((item) => item.produtoId)).size !== itens.length) {
    throw erroValidacao("Um produto nao pode aparecer duas vezes no mesmo pedido", "PRODUTO_DUPLICADO");
  }
}

// A quantidade pedida nao pode ultrapassar o maximo quando ele foi configurado. Sem maximo, nao
// existe teto conhecido e o sistema nao inventa um numero.
function resolverItens(
  itens: Array<{ produtoId: string; quantidade: number }>,
  produtosPorId: Map<string, ProdutoEstoqueLinha>
): ItemPedidoParaCriar[] {
  validarItensSemDuplicidade(itens);
  return itens.map((item) => {
    const produto = produtosPorId.get(item.produtoId);
    if (!produto) throw erroValidacao("Produto nao pertence a empresa informada", "INVALID_PRODUCT");
    if (produto.estoqueMax !== null && produto.quantidadeEstoque + item.quantidade > produto.estoqueMax) {
      throw erroValidacao(
        `Quantidade de ${produto.descricao} ultrapassa o estoque maximo configurado`,
        "ESTOQUE_MAXIMO_ULTRAPASSADO"
      );
    }
    return {
      produtoId: item.produtoId,
      descricaoProduto: produto.descricao,
      quantidade: item.quantidade,
      estoqueAtual: produto.quantidadeEstoque,
      estoqueMin: produto.estoqueMin,
      estoqueMax: produto.estoqueMax
    };
  });
}

async function validarFornecedor(fornecedorId: string, empresaId: string): Promise<void> {
  if (!(await fornecedorPertenceAEmpresaRepository(fornecedorId, empresaId))) {
    throw erroValidacao("Fornecedor nao pertence a empresa informada", "INVALID_SUPPLIER");
  }
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

export async function criarPedido(payload: PedidoPayload, perfil: PerfilUsuario): Promise<{ id: string }> {
  validarEmpresa(perfil, payload.empresaId);
  await validarFornecedor(payload.fornecedorId, payload.empresaId);
  const produtos = await buscarProdutosEstoqueRepository(payload.empresaId);
  return criarPedidoRepository({
    empresaId: payload.empresaId,
    fornecedorId: payload.fornecedorId,
    tipo: "manual",
    dataAgendada: payload.dataAgendada ?? null,
    recorrencia: payload.recorrencia,
    observacao: payload.observacao ?? null,
    criadoPor: perfil.usuarioId,
    itens: resolverItens(payload.itens, new Map(produtos.map((produto) => [produto.id, produto])))
  });
}

export async function gerarPedidoAutomatico(
  payload: GerarPedidoAutomaticoPayload,
  perfil: PerfilUsuario
): Promise<{ id: string; totalItens: number }> {
  validarEmpresa(perfil, payload.empresaId);
  await validarFornecedor(payload.fornecedorId, payload.empresaId);
  const produtos = await buscarProdutosEstoqueRepository(payload.empresaId);
  const sugeridos = gerarItensReposicao(produtos);
  if (!sugeridos.length) throw erroValidacao("Nenhum produto atingiu o estoque minimo", "SEM_REPOSICAO");
  const pedido = await criarPedidoRepository({
    empresaId: payload.empresaId,
    fornecedorId: payload.fornecedorId,
    tipo: "automatico",
    dataAgendada: payload.dataAgendada ?? null,
    recorrencia: payload.recorrencia,
    observacao: "Sugestao de reposicao gerada pelo Compras.",
    criadoPor: perfil.usuarioId,
    itens: sugeridos.map((item) => ({
      produtoId: item.produtoId,
      descricaoProduto: item.descricao ?? "Produto",
      quantidade: item.quantidadeSugerida,
      estoqueAtual: item.quantidadeAtual,
      estoqueMin: item.estoqueMin,
      estoqueMax: item.estoqueMax
    }))
  });
  return { id: pedido.id, totalItens: sugeridos.length };
}

export async function atualizarPedido(
  pedidoId: string,
  payload: PedidoEdicaoPayload,
  perfil: PerfilUsuario
): Promise<void> {
  const base = await buscarPedidoBaseRepository(pedidoId);
  if (!base || !podeAcessarEmpresa(perfil, base.empresaId)) throw naoEncontrado("Pedido nao encontrado");
  if (base.status !== "a_fazer") throw erroValidacao("So e possivel editar pedido em A fazer", "PEDIDO_NAO_EDITAVEL");
  if (payload.fornecedorId) await validarFornecedor(payload.fornecedorId, base.empresaId);
  const produtos = await buscarProdutosEstoqueRepository(base.empresaId);
  await atualizarPedidoRepository(pedidoId, {
    fornecedorId: payload.fornecedorId,
    dataAgendada: payload.dataAgendada,
    recorrencia: payload.recorrencia,
    observacao: payload.observacao,
    itens: resolverItens(payload.itens, new Map(produtos.map((produto) => [produto.id, produto])))
  });
}

const transicoesPermitidas: Record<string, PedidoStatusNovo[]> = {
  a_fazer: ["enviado", "cancelado"],
  enviado: ["retornado", "confirmado", "cancelado"],
  retornado: ["confirmado", "cancelado"],
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
      if (itemRecebido.quantidadeConferida > Number(itemPedido.quantidadePendente)) {
        throw erroValidacao(
          `Quantidade conferida ultrapassa o pendente de ${itemPedido.descricaoProduto}`,
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
      if (!vencedor || vencedor.pedidoId !== pedidoId) throw new Error("Recebimento nao criado");
      return { recebimentoId: vencedor.id, duplicado: true, status: "recebido_parcial" };
    }

    const produtosTravados = await travarProdutosRepository(
      pedido.empresaId,
      payload.itens.map((item) => itensPorId.get(item.pedidoItemId)?.produtoId ?? ""),
      tx
    );
    const saldos = new Map(produtosTravados.map((produto) => [produto.id, produto.quantidadeEstoque]));
    if (saldos.size !== new Set(payload.itens.map((item) => itensPorId.get(item.pedidoItemId)?.produtoId)).size) {
      throw erroValidacao("Produto do pedido nao pertence a empresa", "INVALID_PRODUCT");
    }

    for (const itemRecebido of payload.itens) {
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
      itemPedido.quantidadePendente = String(Number(itemPedido.quantidade) - Number(itemPedido.quantidadeRecebida));
    }

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

function mesmaIntencaoRecebimento(
  gravado: {
    observacao: string | null;
    itens: Array<{ pedidoItemId: string; quantidadeConferida: number }>;
  },
  recebido: PedidoRecebimentoPayload
): boolean {
  const assinatura = (itens: Array<{ pedidoItemId: string; quantidadeConferida: number }>) =>
    [...itens]
      .sort((a, b) => a.pedidoItemId.localeCompare(b.pedidoItemId))
      .map((item) => `${item.pedidoItemId}:${item.quantidadeConferida}`)
      .join("|");
  return (
    (gravado.observacao ?? "") === (recebido.observacao ?? "") &&
    assinatura(gravado.itens) === assinatura(recebido.itens)
  );
}
