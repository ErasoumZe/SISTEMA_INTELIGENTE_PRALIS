import { asc, eq, inArray } from "drizzle-orm";
import {
  produtos,
  produtosConversoes,
  produtosFiscal,
  produtosPromocoes,
  produtosTransformacao
} from "@padaria/db/schema/cadastro";
import { banco } from "../banco/conexao.js";

/**
 * `inArray` com lista vazia gera SQL invalido no Drizzle. Quando a pagina nao tem produto nenhum,
 * usamos um uuid que nunca existe — mais simples que ramificar cada uma das quatro consultas.
 */
const SEM_RESULTADO = "00000000-0000-0000-0000-000000000000";

export async function listarProdutosRepository(escopoEmpresas: string[]) {
  const linhas = await banco
    .select({
      id: produtos.id,
      empresaId: produtos.empresaId,
      grupoMercadoriaId: produtos.grupoMercadoriaId,
      unidadeMedidaId: produtos.unidadeMedidaId,
      unidadeIndividualId: produtos.unidadeIndividualId,
      codigo: produtos.codigo,
      codigoInterno: produtos.codigoInterno,
      codigoBarras: produtos.codigoBarras,
      descricao: produtos.descricao,
      marca: produtos.marca,
      quantidadeIndividual: produtos.quantidadeIndividual,
      embalagem: produtos.embalagem,
      cDe: produtos.cDe,
      quantidadeCaixa: produtos.quantidadeCaixa,
      medidaCompra: produtos.medidaCompra,
      custo: produtos.custo,
      margem: produtos.margem,
      precoVenda: produtos.precoVenda,
      auto: produtos.auto,
      status: produtos.status,
      tipo: produtos.tipo,
      quantidadeEstoque: produtos.quantidadeEstoque,
      estoqueMin: produtos.estoqueMin,
      estoqueMax: produtos.estoqueMax,
      setorEstoque: produtos.setorEstoque,
      localVenda1: produtos.localVenda1,
      localVenda2: produtos.localVenda2,
      fotoUrl: produtos.fotoUrl
    })
    .from(produtos)
    .where(inArray(produtos.empresaId, escopoEmpresas))
    .orderBy(asc(produtos.descricao));

  // As satelites sao buscadas SO dos produtos ja filtrados pelo escopo. A versao anterior lia as
  // quatro tabelas inteiras, sem WHERE nenhum — todas as empresas, a cada listagem.
  const ids = linhas.length ? linhas.map((produto) => produto.id) : [SEM_RESULTADO];
  const conversoes = await banco
    .select({
      id: produtosConversoes.id,
      produtoId: produtosConversoes.produtoId,
      unidadeMedidaId: produtosConversoes.unidadeMedidaId,
      quantidade: produtosConversoes.quantidade,
      unidadesIndividuais: produtosConversoes.unidadesIndividuais
    })
    .from(produtosConversoes)
    .where(inArray(produtosConversoes.produtoId, ids));
  const fiscais = await banco
    .select({
      produtoId: produtosFiscal.produtoId,
      ncm: produtosFiscal.ncm,
      cest: produtosFiscal.cest,
      categoriaFiscal: produtosFiscal.categoriaFiscal,
      cstPisCofins: produtosFiscal.cstPisCofins,
      aliquotaCheia: produtosFiscal.aliquotaCheia,
      aliquotaFcp: produtosFiscal.aliquotaFcp,
      aliquotaPis: produtosFiscal.aliquotaPis,
      aliquotaCofins: produtosFiscal.aliquotaCofins,
      reducaoIcms: produtosFiscal.reducaoIcms,
      icms: produtosFiscal.icms
    })
    .from(produtosFiscal)
    .where(inArray(produtosFiscal.produtoId, ids));
  const transformacoes = await banco
    .select({
      produtoId: produtosTransformacao.produtoId,
      precisao: produtosTransformacao.precisao,
      quantidade: produtosTransformacao.quantidade,
      unidade: produtosTransformacao.unidade,
      produtoReceituario: produtosTransformacao.produtoReceituario
    })
    .from(produtosTransformacao)
    .where(inArray(produtosTransformacao.produtoId, ids));
  const promocoes = await banco
    .select({
      id: produtosPromocoes.id,
      produtoId: produtosPromocoes.produtoId,
      tipo: produtosPromocoes.tipo,
      valor: produtosPromocoes.valor,
      descontoFracao: produtosPromocoes.descontoFracao,
      horaInicio: produtosPromocoes.horaInicio,
      horaFim: produtosPromocoes.horaFim,
      seg: produtosPromocoes.seg,
      ter: produtosPromocoes.ter,
      qua: produtosPromocoes.qua,
      qui: produtosPromocoes.qui,
      sex: produtosPromocoes.sex,
      sab: produtosPromocoes.sab,
      dom: produtosPromocoes.dom,
      validaAte: produtosPromocoes.validaAte
    })
    .from(produtosPromocoes)
    .where(inArray(produtosPromocoes.produtoId, ids));

  return linhas.map((produto) => ({
    ...produto,
    conversoes: conversoes.filter((conversao) => conversao.produtoId === produto.id),
    fiscal: fiscais.find((item) => item.produtoId === produto.id) ?? null,
    transformacao: transformacoes.find((item) => item.produtoId === produto.id) ?? null,
    promocoes: promocoes.filter((item) => item.produtoId === produto.id)
  }));
}

/** Empresa dona do produto, para decidir escopo sem carregar o registro inteiro. */
export async function empresaDoProdutoRepository(id: string): Promise<string | null> {
  const [linha] = await banco.select({ empresaId: produtos.empresaId }).from(produtos).where(eq(produtos.id, id));
  return linha?.empresaId ?? null;
}
