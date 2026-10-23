import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import type {
  ItemTeto,
  SolicitacaoDto,
  SolicitacaoEdicaoPayload,
  SolicitacaoPayload,
  SolicitacoesQuery
} from "@padaria/shared/compras";
import { pendenciasDeTeto } from "@padaria/shared/compras";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import { executarEmTransacao, type TransacaoBanco } from "../banco/conexao.js";
import { erroValidacao, naoEncontrado, naoProcessavel, proibido } from "../erros.js";
import { buscarProdutosEstoqueRepository, type ProdutoEstoqueLinha } from "../pedidos/pedidos.repository.js";
import {
  atualizarSolicitacaoRepository,
  buscarSolicitacaoParaEdicaoRepository,
  criarSolicitacaoRepository,
  detalharSolicitacaoRepository,
  listarSolicitacoesRepository,
  type ItemEntrada
} from "./compras-solicitacoes.repository.js";

function validarEmpresa(perfil: PerfilUsuario, empresaId: string): void {
  if (!podeAcessarEmpresa(perfil, empresaId)) throw proibido("Empresa nao permitida", "FORBIDDEN_COMPANY");
}

function validarItensSemDuplicidade(itens: Array<{ produtoId: string }>): void {
  if (new Set(itens.map((item) => item.produtoId)).size !== itens.length) {
    throw erroValidacao("Um produto nao pode aparecer duas vezes na mesma solicitacao", "PRODUTO_DUPLICADO");
  }
}

/**
 * Monta os itens com o retrato do estoque e aplica o teto pelo CONJUNTO (nao item a item): e aqui que
 * o bug do fan-out do pedido legado morre. Produto fora da empresa nem entra no mapa -> 400 limpo; a
 * FK composta no banco e a segunda tranca.
 */
function resolverItens(
  itens: Array<{ produtoId: string; quantidade: number }>,
  produtosPorId: Map<string, ProdutoEstoqueLinha>
): ItemEntrada[] {
  validarItensSemDuplicidade(itens);
  const entradas: ItemEntrada[] = itens.map((item) => {
    const produto = produtosPorId.get(item.produtoId);
    if (!produto) throw erroValidacao("Produto nao pertence a empresa informada", "INVALID_PRODUCT");
    return {
      produtoId: item.produtoId,
      descricaoProduto: produto.descricao,
      quantidade: item.quantidade,
      estoqueAtual: produto.quantidadeEstoque,
      estoqueMin: produto.estoqueMin,
      estoqueMax: produto.estoqueMax
    };
  });
  const paraTeto: ItemTeto[] = entradas.map((item) => ({
    produtoId: item.produtoId,
    descricao: item.descricaoProduto,
    quantidade: item.quantidade,
    estoqueAtual: item.estoqueAtual,
    estoqueMax: item.estoqueMax
  }));
  const pendencias = pendenciasDeTeto(paraTeto);
  if (pendencias.length) {
    throw naoProcessavel(
      "Quantidade pedida passa do estoque maximo configurado",
      "ESTOQUE_MAXIMO_ULTRAPASSADO",
      pendencias
    );
  }
  return entradas;
}

export async function listarSolicitacoes(query: SolicitacoesQuery, perfil: PerfilUsuario): Promise<SolicitacaoDto[]> {
  validarEmpresa(perfil, query.empresaId);
  const linhas = await listarSolicitacoesRepository(query.empresaId, query.status);
  return linhas.map((linha) => ({
    id: linha.id,
    empresaId: linha.empresaId,
    status: linha.status,
    origem: linha.origem,
    observacao: linha.observacao,
    criadoEm: linha.criadoEm.toISOString(),
    totalItens: Number(linha.totalItens)
  }));
}

export async function obterSolicitacao(id: string, perfil: PerfilUsuario): Promise<SolicitacaoDto> {
  // Busca por id e confere a empresa da linha contra o perfil (mesmo padrao de obterPedido).
  const solicitacao = await detalharSolicitacaoRepository(id);
  if (!solicitacao || !podeAcessarEmpresa(perfil, solicitacao.empresaId)) {
    throw naoEncontrado("Solicitacao nao encontrada");
  }
  return {
    id: solicitacao.id,
    empresaId: solicitacao.empresaId,
    status: solicitacao.status,
    origem: solicitacao.origem,
    observacao: solicitacao.observacao,
    criadoEm: solicitacao.criadoEm.toISOString(),
    totalItens: solicitacao.itens.length,
    itens: solicitacao.itens.map((item) => ({
      id: item.id,
      produtoId: item.produtoId,
      descricaoProduto: item.descricaoProduto,
      quantidade: item.quantidade,
      estoqueAtual: item.estoqueAtual,
      estoqueMin: item.estoqueMin,
      estoqueMax: item.estoqueMax
    }))
  };
}

export async function criarSolicitacao(payload: SolicitacaoPayload, perfil: PerfilUsuario): Promise<{ id: string }> {
  validarEmpresa(perfil, payload.empresaId);
  const produtos = await buscarProdutosEstoqueRepository(payload.empresaId);
  const itens = resolverItens(payload.itens, new Map(produtos.map((produto) => [produto.id, produto])));
  return executarEmTransacao((tx) =>
    criarSolicitacaoRepository(
      {
        empresaId: payload.empresaId,
        origem: payload.origem,
        observacao: payload.observacao ?? null,
        criadoPor: perfil.usuarioId,
        itens
      },
      tx
    )
  );
}

/**
 * Troca os itens de uma solicitacao em rascunho dentro de uma transacao que ja existe (doc 58 §2: o responsavel
 * poe as quantidades e envia, tudo ou nada). Mesmas regras da edicao: produto da empresa, sem repetir, teto.
 */
export async function substituirItensNaTransacao(
  id: string,
  empresaId: string,
  itens: Array<{ produtoId: string; quantidade: number }>,
  observacao: string | null,
  tx: TransacaoBanco
): Promise<void> {
  const base = await buscarSolicitacaoParaEdicaoRepository(id, empresaId, tx);
  if (!base) throw naoEncontrado("Solicitacao nao encontrada");
  if (base.status !== "rascunho") {
    throw erroValidacao("So e possivel editar solicitacao em rascunho", "SOLICITACAO_NAO_EDITAVEL");
  }
  const produtos = await buscarProdutosEstoqueRepository(empresaId, tx);
  const entradas = resolverItens(itens, new Map(produtos.map((produto) => [produto.id, produto])));
  await atualizarSolicitacaoRepository({ id, empresaId, observacao, itens: entradas }, tx);
}

export async function atualizarSolicitacao(
  id: string,
  payload: SolicitacaoEdicaoPayload,
  perfil: PerfilUsuario
): Promise<void> {
  await executarEmTransacao(async (tx) => {
    // Trava a solicitacao e so segue em rascunho: assim que a rodada envia, a quantidade e um
    // envelope congelado e nao pode mudar por baixo.
    const base = await buscarSolicitacaoParaEdicaoRepository(id, payload.empresaId, tx);
    if (!base || !podeAcessarEmpresa(perfil, payload.empresaId)) throw naoEncontrado("Solicitacao nao encontrada");
    if (base.status !== "rascunho") {
      throw erroValidacao("So e possivel editar solicitacao em rascunho", "SOLICITACAO_NAO_EDITAVEL");
    }
    const produtos = await buscarProdutosEstoqueRepository(payload.empresaId, tx);
    const itens = resolverItens(payload.itens, new Map(produtos.map((produto) => [produto.id, produto])));
    await atualizarSolicitacaoRepository(
      { id, empresaId: payload.empresaId, observacao: payload.observacao ?? null, itens },
      tx
    );
  });
}
