import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import type {
  GerarPedidoAutomaticoPayload,
  PedidoDto,
  PedidoEdicaoPayload,
  PedidoPayload,
  PedidosQuery
} from "@padaria/shared/pedidos";
import { gerarItensReposicao } from "@padaria/shared/pedidos";
import { empresasPermitidas, podeAcessarEmpresa } from "../auth/empresa.js";
import { erroValidacao, naoEncontrado, proibido } from "../erros.js";
import {
  aprovarPedidoRepository,
  atualizarPedidoRepository,
  buscarPedidoBaseRepository,
  buscarProdutosEstoqueRepository,
  criarPedidoRepository,
  listarPedidosRepository,
  obterPedidoDetalheRepository,
  type ItemPedidoParaCriar,
  type ProdutoEstoqueLinha
} from "./pedidos.repository.js";

function validarEmpresa(perfil: PerfilUsuario, empresaId: string): void {
  if (!podeAcessarEmpresa(perfil, empresaId)) throw proibido("Empresa nao permitida", "FORBIDDEN_COMPANY");
}

// Resolve descricao + snapshot de estoque de cada item manual a partir dos produtos da empresa.
function resolverItensManuais(
  itens: PedidoPayload["itens"],
  produtosPorId: Map<string, ProdutoEstoqueLinha>
): ItemPedidoParaCriar[] {
  return itens.map((item) => {
    const produto = produtosPorId.get(item.produtoId);
    if (!produto) throw erroValidacao("Produto nao pertence a empresa informada", "INVALID_PRODUCT");
    return {
      produtoId: item.produtoId,
      fornecedorId: item.fornecedorId ?? null,
      descricaoProduto: produto.descricao,
      quantidade: item.quantidade,
      estoqueAtual: produto.quantidadeEstoque,
      estoqueMin: produto.estoqueMin,
      estoqueMax: produto.estoqueMax
    };
  });
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
  const produtos = await buscarProdutosEstoqueRepository(payload.empresaId);
  const produtosPorId = new Map(produtos.map((produto) => [produto.id, produto]));
  return criarPedidoRepository({
    empresaId: payload.empresaId,
    tipo: "manual",
    dataAgendada: payload.dataAgendada ?? null,
    recorrencia: payload.recorrencia,
    observacao: payload.observacao ?? null,
    criadoPor: perfil.usuarioId,
    itens: resolverItensManuais(payload.itens, produtosPorId)
  });
}

export async function gerarPedidoAutomatico(
  payload: GerarPedidoAutomaticoPayload,
  perfil: PerfilUsuario
): Promise<{ id: string; totalItens: number }> {
  validarEmpresa(perfil, payload.empresaId);
  const produtos = await buscarProdutosEstoqueRepository(payload.empresaId);
  const sugeridos = gerarItensReposicao(produtos);
  if (!sugeridos.length) {
    throw erroValidacao("Nenhum produto atingiu o estoque minimo", "SEM_REPOSICAO");
  }
  const itens: ItemPedidoParaCriar[] = sugeridos.map((item) => ({
    produtoId: item.produtoId,
    fornecedorId: null,
    descricaoProduto: item.descricao ?? "Produto",
    quantidade: item.quantidadeSugerida,
    estoqueAtual: item.quantidadeAtual,
    estoqueMin: item.estoqueMin,
    estoqueMax: item.estoqueMax
  }));
  const pedido = await criarPedidoRepository({
    empresaId: payload.empresaId,
    tipo: "automatico",
    dataAgendada: payload.dataAgendada ?? null,
    recorrencia: payload.recorrencia,
    observacao: null,
    criadoPor: perfil.usuarioId,
    itens
  });
  return { id: pedido.id, totalItens: itens.length };
}

export async function atualizarPedido(
  pedidoId: string,
  payload: PedidoEdicaoPayload,
  perfil: PerfilUsuario
): Promise<void> {
  const base = await buscarPedidoBaseRepository(pedidoId);
  if (!base || !podeAcessarEmpresa(perfil, base.empresaId)) throw naoEncontrado("Pedido nao encontrado");
  if (base.status !== "rascunho") throw erroValidacao("So e possivel editar pedido em rascunho", "PEDIDO_NAO_EDITAVEL");
  const produtos = await buscarProdutosEstoqueRepository(base.empresaId);
  const produtosPorId = new Map(produtos.map((produto) => [produto.id, produto]));
  await atualizarPedidoRepository(pedidoId, {
    dataAgendada: payload.dataAgendada,
    recorrencia: payload.recorrencia,
    observacao: payload.observacao,
    itens: resolverItensManuais(payload.itens, produtosPorId)
  });
}

export async function aprovarPedido(pedidoId: string, perfil: PerfilUsuario): Promise<void> {
  const base = await buscarPedidoBaseRepository(pedidoId);
  if (!base || !podeAcessarEmpresa(perfil, base.empresaId)) throw naoEncontrado("Pedido nao encontrado");
  if (base.status !== "rascunho")
    throw erroValidacao("So e possivel aprovar pedido em rascunho", "PEDIDO_NAO_APROVAVEL");
  await aprovarPedidoRepository(pedidoId, perfil.usuarioId);
}
