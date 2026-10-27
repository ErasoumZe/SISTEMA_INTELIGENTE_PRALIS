import { and, eq, inArray } from "drizzle-orm";
import {
  gruposMercadorias,
  perfisUsuarios,
  produtos,
  produtosConversoes,
  produtosFiscal,
  produtosPromocoes,
  produtosTransformacao,
  unidadesMedida
} from "@padaria/db/schema/cadastro";
import { banco } from "../banco/conexao.js";

/**
 * Detalhe COMPLETO de um produto, com as quatro satelites — o que o formulario de edicao precisa.
 *
 * Devolve `null` quando o produto nao existe OU esta fora do escopo autorizado: quem chama responde
 * 404 nos dois casos, para nao permitir enumerar o cadastro de outra empresa.
 */
export async function detalheProdutoRepository(id: string, escopoEmpresas: string[]) {
  if (!escopoEmpresas.length) return null;

  const [produto] = await banco
    .select({
      id: produtos.id,
      empresaId: produtos.empresaId,
      grupoMercadoriaId: produtos.grupoMercadoriaId,
      grupoNome: gruposMercadorias.nome,
      unidadeMedidaId: produtos.unidadeMedidaId,
      unidadeIndividualId: produtos.unidadeIndividualId,
      unidadeIndividualSigla: unidadesMedida.sigla,
      codigo: produtos.codigo,
      codigoInterno: produtos.codigoInterno,
      codigoBarras: produtos.codigoBarras,
      descricao: produtos.descricao,
      nomeCatalogo: produtos.nomeCatalogo,
      pesavel: produtos.pesavel,
      teclaBalanca: produtos.teclaBalanca,
      validadeBalanca: produtos.validadeBalanca,
      grupoIdExterno: produtos.grupoIdExterno,
      areaVenda: produtos.areaVenda,
      marca: produtos.marca,
      compraAproximada: produtos.compraAproximada,
      habilitarAjuda: produtos.habilitarAjuda,
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
      areaEstoque: produtos.areaEstoque,
      setorEstoque: produtos.setorEstoque,
      curvaAbc: produtos.curvaAbc,
      quantidadeVariavel: produtos.quantidadeVariavel,
      toleranciaQuantidadePercentual: produtos.toleranciaQuantidadePercentual,
      localVenda1: produtos.localVenda1,
      localVenda2: produtos.localVenda2,
      setorVenda1: produtos.setorVenda1,
      setorVenda2: produtos.setorVenda2,
      fotoUrl: produtos.fotoUrl,
      criadoEm: produtos.criadoEm,
      criadoPorNome: perfisUsuarios.nome
    })
    .from(produtos)
    .leftJoin(gruposMercadorias, eq(produtos.grupoMercadoriaId, gruposMercadorias.id))
    .leftJoin(unidadesMedida, eq(produtos.unidadeIndividualId, unidadesMedida.id))
    .leftJoin(perfisUsuarios, eq(produtos.criadoPor, perfisUsuarios.usuarioId))
    .where(and(eq(produtos.id, id), inArray(produtos.empresaId, escopoEmpresas)));

  if (!produto) return null;

  const conversoes = await banco
    .select({
      id: produtosConversoes.id,
      unidadeMedidaId: produtosConversoes.unidadeMedidaId,
      quantidade: produtosConversoes.quantidade,
      unidadesIndividuais: produtosConversoes.unidadesIndividuais
    })
    .from(produtosConversoes)
    .where(eq(produtosConversoes.produtoId, id));

  const [fiscal] = await banco
    .select({
      ncm: produtosFiscal.ncm,
      cest: produtosFiscal.cest,
      categoriaFiscal: produtosFiscal.categoriaFiscal,
      cstPisCofins: produtosFiscal.cstPisCofins,
      aliquotaCheia: produtosFiscal.aliquotaCheia,
      aliquotaFcp: produtosFiscal.aliquotaFcp,
      aliquotaPis: produtosFiscal.aliquotaPis,
      aliquotaCofins: produtosFiscal.aliquotaCofins,
      reducaoIcms: produtosFiscal.reducaoIcms,
      icms: produtosFiscal.icms,
      tributacaoSimples: produtosFiscal.tributacaoSimples,
      aliquotaSimples: produtosFiscal.aliquotaSimples,
      icmsRe: produtosFiscal.icmsRe,
      baseFiscal: produtosFiscal.baseFiscal,
      codigoFiscal: produtosFiscal.codigoFiscal,
      produtoFiscal: produtosFiscal.produtoFiscal,
      cstReforma: produtosFiscal.cstReforma,
      cClassTrib: produtosFiscal.cClassTrib,
      aliquotaIbs: produtosFiscal.aliquotaIbs,
      aliquotaCbs: produtosFiscal.aliquotaCbs,
      origemFiscal: produtosFiscal.origemFiscal,
      aliquotaEcf: produtosFiscal.aliquotaEcf,
      aliquotaEcfId: produtosFiscal.aliquotaEcfId,
      estado: produtosFiscal.estado,
      motivo: produtosFiscal.motivo,
      conferidoEm: produtosFiscal.conferidoEm,
      pctNcm: produtosFiscal.pctNcm
    })
    .from(produtosFiscal)
    .where(eq(produtosFiscal.produtoId, id));

  const [transformacao] = await banco
    .select({
      precisao: produtosTransformacao.precisao,
      quantidade: produtosTransformacao.quantidade,
      unidade: produtosTransformacao.unidade,
      produtoReceituario: produtosTransformacao.produtoReceituario,
      refReceituario: produtosTransformacao.refReceituario
    })
    .from(produtosTransformacao)
    .where(eq(produtosTransformacao.produtoId, id));

  const promocoes = await banco
    .select({
      id: produtosPromocoes.id,
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
    .where(eq(produtosPromocoes.produtoId, id));

  return {
    ...produto,
    conversoes,
    fiscal: fiscal ? { ...fiscal, conferidoEm: fiscal.conferidoEm?.toISOString() ?? null } : null,
    transformacao: transformacao ?? null,
    promocoes
  };
}
