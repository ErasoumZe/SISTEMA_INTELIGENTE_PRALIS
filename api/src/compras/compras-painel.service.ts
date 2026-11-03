import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import {
  contarSituacoes,
  situacaoDaOferta,
  type CotacaoDoProdutoDto,
  type OfertaDoProdutoDto,
  type PainelComprasDto
} from "@padaria/shared/compras";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import { naoEncontrado, proibido } from "../erros.js";
import { rankingsDaEmpresa } from "./compras-agendamento.service.js";
import { listarEstoqueProdutosRepository } from "./compras.repository.js";
import {
  convitesDosItensRepository,
  itensEmCotacaoRepository,
  respostasDosItensRepository,
  vencedoresDosItensRepository
} from "./compras-painel.repository.js";
import { buscarPrecosBaseVigentesRepository } from "./compras-rodadas.repository.js";

// Cotacao por fornecedor (doc 58 §4): cada produto em cotacao, quantos fornecedores receberam e onde cada um esta.

function validarEmpresa(perfil: PerfilUsuario, empresaId: string) {
  if (!podeAcessarEmpresa(perfil, empresaId)) throw proibido("Empresa nao permitida", "FORBIDDEN_COMPANY");
}

/** Todas as ofertas (fornecedor x item em cotacao), com a situacao de cada uma. */
async function ofertasEmCotacao(empresaId: string, produtoId?: string) {
  const itens = await itensEmCotacaoRepository(empresaId, produtoId);
  const itemIds = itens.map((item) => item.rodadaItemId);
  const [convites, vencedores] = await Promise.all([
    convitesDosItensRepository(itemIds),
    vencedoresDosItensRepository(itemIds)
  ]);
  const respostas = await respostasDosItensRepository(convites.map((convite) => convite.conviteItemId));
  const itemPorId = new Map(itens.map((item) => [item.rodadaItemId, item]));

  const ofertas: Array<OfertaDoProdutoDto & { produtoId: string; descricao: string }> = [];
  for (const convite of convites) {
    const item = itemPorId.get(convite.rodadaItemId);
    if (!item) continue;
    const vencedor = vencedores.get(item.rodadaItemId);
    // Cotacao fechada: so interessa o que ainda espera decisao (o comprado ja foi para Pedidos a receber).
    if (item.rodadaStatus !== "aberta" && vencedor) continue;
    const doConviteItem = respostas.filter((resposta) => resposta.conviteItemId === convite.conviteItemId);
    const doItem = doConviteItem.filter((resposta) => resposta.autorTipo === "fornecedor");
    const enviada = doItem.filter((resposta) => resposta.status === "enviada").sort((a, b) => b.versao - a.versao)[0];
    // Contraproposta do comprador mais nova que a ultima resposta do fornecedor: ainda espera por ele.
    const contraproposta = doConviteItem
      .filter((resposta) => resposta.autorTipo === "comprador" && resposta.status === "enviada")
      .sort((a, b) => b.versao - a.versao)[0];
    const contrapropostaPendente =
      contraproposta && contraproposta.versao > (enviada?.versao ?? 0) ? contraproposta.valorUnitario : null;
    const rascunho = doItem.some((resposta) => resposta.status === "rascunho");
    const custo = enviada ? (enviada.custoFinalUnitario ?? enviada.valorUnitario) : null;
    const situacao = situacaoDaOferta({
      compradoDeste: vencedor === convite.fornecedorId,
      compradoDeOutro: Boolean(vencedor) && vencedor !== convite.fornecedorId,
      enviada: enviada ? { indisponivel: enviada.indisponivel, custo: custo === null ? null : Number(custo) } : null,
      rascunho,
      referencia: item.precoBaseValor === null ? null : Number(item.precoBaseValor)
    });
    ofertas.push({
      produtoId: item.produtoId,
      descricao: item.descricao,
      rodadaId: item.rodadaId,
      rodadaItemId: item.rodadaItemId,
      conviteId: convite.conviteId,
      rodadaNumero: item.rodadaNumero,
      solicitacaoId: item.solicitacaoId,
      rodadaAberta: item.rodadaStatus === "aberta",
      abertaEm: item.abertaEm.toISOString(),
      expiraEm: item.expiraEm.toISOString(),
      fornecedorId: convite.fornecedorId,
      fornecedorNome: convite.fornecedorNome,
      situacao,
      quantidadePedida: item.quantidade,
      quantidadeDisponivel: enviada?.quantidadeDisponivel ?? null,
      valorUnitario: enviada?.valorUnitario ?? null,
      custoFinalUnitario: enviada?.custoFinalUnitario ?? null,
      indisponivel: enviada?.indisponivel ?? false,
      propostaItemId: enviada?.propostaItemId ?? null,
      contrapropostaUnitario: contrapropostaPendente
    });
  }
  return ofertas;
}

export async function obterPainelCompras(empresaId: string, perfil: PerfilUsuario): Promise<PainelComprasDto> {
  validarEmpresa(perfil, empresaId);
  const ofertas = await ofertasEmCotacao(empresaId);
  const produtoIds = [...new Set(ofertas.map((oferta) => oferta.produtoId))];
  const [rankings, estoque, referencias] = await Promise.all([
    rankingsDaEmpresa(empresaId),
    listarEstoqueProdutosRepository({ empresaId }),
    buscarPrecosBaseVigentesRepository(empresaId, produtoIds)
  ]);
  const unidadePorId = new Map(estoque.map((produto) => [produto.id, produto.unidade]));
  return {
    produtos: produtoIds
      .map((produtoId) => {
        const doProduto = ofertas.filter((oferta) => oferta.produtoId === produtoId);
        return {
          produtoId,
          descricao: doProduto[0]!.descricao,
          unidade: unidadePorId.get(produtoId) ?? null,
          referencia: referencias.get(produtoId)?.valor ?? null,
          maisVende: rankings.maisVende.has(produtoId),
          maisCompra: rankings.maisCompra.has(produtoId),
          maisLucro: rankings.maisLucro.has(produtoId),
          celulas: contarSituacoes(doProduto.map((oferta) => oferta.situacao))
        };
      })
      .sort((a, b) => a.descricao.localeCompare(b.descricao))
  };
}

/** A cotacao de um produto: cada fornecedor, o que ofereceu e onde esta (para aceitar o "Com aumento"). */
export async function obterCotacaoDoProduto(
  produtoId: string,
  empresaId: string,
  perfil: PerfilUsuario
): Promise<CotacaoDoProdutoDto> {
  validarEmpresa(perfil, empresaId);
  const ofertas = await ofertasEmCotacao(empresaId, produtoId);
  if (!ofertas.length) throw naoEncontrado("Este produto nao esta em cotacao");
  const [estoque, referencias] = await Promise.all([
    listarEstoqueProdutosRepository({ empresaId }),
    buscarPrecosBaseVigentesRepository(empresaId, [produtoId])
  ]);
  return {
    produtoId,
    descricao: ofertas[0]!.descricao,
    unidade: estoque.find((produto) => produto.id === produtoId)?.unidade ?? null,
    referencia: referencias.get(produtoId)?.valor ?? null,
    ofertas: ofertas.map(({ produtoId: _produto, descricao: _descricao, ...oferta }) => oferta)
  };
}
