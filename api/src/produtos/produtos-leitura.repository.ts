import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  ilike,
  inArray,
  isNotNull,
  ne,
  or,
  sql,
  type SQL,
  type SQLWrapper
} from "drizzle-orm";
import { codigoBarrasSemZerosIniciais } from "@padaria/db/expressions";
import { candidatosDeCodigo } from "@padaria/shared/produtos";
import type { OrdenacaoProdutos, ProdutoOpcao, ProdutoResumo } from "@padaria/shared/produtos";
import {
  empresas,
  gruposMercadorias,
  perfisUsuarios,
  produtos,
  produtosConversoes,
  produtosPromocoes,
  produtosFiscal,
  produtosTransformacao,
  unidadesMedida
} from "@padaria/db/schema/cadastro";
import { vendas, vendasProdutos } from "@padaria/db/schema/venda";
import { banco } from "../banco/conexao.js";

/**
 * `inArray` com lista vazia gera SQL invalido no Drizzle. Quando nao ha produto na pagina, usamos
 * um uuid que nunca existe — mais simples que ramificar cada consulta de satelite.
 */
const SEM_RESULTADO = "00000000-0000-0000-0000-000000000000";

/** `%` e `_` sao curingas do LIKE: sem escapar, buscar "50%" varreria a tabela inteira. */
function termoDeBusca(bruto: string): string {
  return `%${bruto.replace(/[\\%_]/g, (caractere) => `\\${caractere}`)}%`;
}

/**
 * EAN por IGUALDADE com `candidatosDeCodigo` (o `barcodeCandidates` do oficial): sem zeros a esquerda dos dois
 * lados e etiqueta de balanca achando o PLU. Pedaco de EAN nao acha mais nada — codigo de barras e
 * identidade, nao texto de busca. Busca com LETRA nao gera condicao de EAN: "item 03" viraria o EAN
 * "403" e traria outro produto (o oficial tira os digitos de qualquer texto).
 */
export function codigoDeBarrasIgualA(coluna: SQLWrapper, busca: string): SQL | undefined {
  if (/\p{L}/u.test(busca)) return undefined;
  const variantes = candidatosDeCodigo(busca);
  return variantes.length ? inArray(codigoBarrasSemZerosIniciais(coluna), variantes) : undefined;
}

export interface FiltroListaProdutos {
  escopoEmpresas: string[];
  busca?: string | undefined;
  status?: string | undefined;
  tipo?: string | undefined;
  grupoMercadoriaId?: string | undefined;
  setorEstoque?: string | undefined;
  somenteVendidos?: boolean | undefined;
  ordenar: OrdenacaoProdutos;
  page: number;
  pageSize: number;
}

function condicoesDaLista(filtro: FiltroListaProdutos): SQL | undefined {
  const condicoes: Array<SQL | undefined> = [inArray(produtos.empresaId, filtro.escopoEmpresas)];
  if (filtro.status) condicoes.push(eq(produtos.status, filtro.status));
  if (filtro.tipo) condicoes.push(eq(produtos.tipo, filtro.tipo));
  if (filtro.grupoMercadoriaId) condicoes.push(eq(produtos.grupoMercadoriaId, filtro.grupoMercadoriaId));
  if (filtro.setorEstoque) condicoes.push(eq(produtos.setorEstoque, filtro.setorEstoque));
  if (filtro.somenteVendidos) {
    const codigoBarrasCorrespondente = and(
      isNotNull(produtos.codigoBarras),
      eq(
        codigoBarrasSemZerosIniciais(vendasProdutos.produtoAutomacaoCodigo),
        codigoBarrasSemZerosIniciais(produtos.codigoBarras)
      )
    );
    condicoes.push(
      exists(
        banco
          .select({ encontrado: vendasProdutos.id })
          .from(vendasProdutos)
          .innerJoin(vendas, eq(vendas.id, vendasProdutos.vendaId))
          .where(
            and(
              eq(vendas.empresaId, produtos.empresaId),
              ne(vendas.status, "cancelado"),
              eq(vendasProdutos.cancelado, false),
              or(eq(vendasProdutos.produtoId, produtos.id), codigoBarrasCorrespondente)
            )
          )
      )
    );
  }
  if (filtro.busca) {
    const termo = termoDeBusca(filtro.busca);
    condicoes.push(
      or(
        ilike(produtos.descricao, termo),
        ilike(produtos.marca, termo),
        ilike(produtos.codigo, termo),
        ilike(produtos.codigoInterno, termo),
        codigoDeBarrasIgualA(produtos.codigoBarras, filtro.busca)
      )
    );
  }
  return and(...condicoes);
}

/** As SEIS ordenacoes do contrato. `codigoInterno` e zero-padded, entao ordem textual = numerica. */
function ordenacaoDaLista(ordenar: OrdenacaoProdutos) {
  switch (ordenar) {
    case "antigos":
      return [asc(produtos.criadoEm), asc(produtos.codigoInterno)];
    case "az":
      return [asc(produtos.descricao)];
    case "za":
      return [desc(produtos.descricao)];
    case "codigo_asc":
      return [asc(produtos.codigoInterno)];
    case "codigo_desc":
      return [desc(produtos.codigoInterno)];
    default:
      return [desc(produtos.criadoEm), desc(produtos.codigoInterno)];
  }
}

type ResumoBruto = Omit<ProdutoResumo, "precoVendaAtual">;

/**
 * Resumo paginado NO BANCO. A versao anterior carregava todos os produtos e as quatro tabelas
 * satelites inteiras para so entao cortar a pagina em memoria.
 */
export async function listarProdutosPaginadoRepository(
  filtro: FiltroListaProdutos
): Promise<{ itens: ResumoBruto[]; total: number }> {
  const onde = condicoesDaLista(filtro);

  const itens = await banco
    .select({
      id: produtos.id,
      empresaId: produtos.empresaId,
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
      tipo: produtos.tipo,
      status: produtos.status,
      grupoMercadoriaId: produtos.grupoMercadoriaId,
      grupoNome: gruposMercadorias.nome,
      quantidadeIndividual: produtos.quantidadeIndividual,
      unidadeIndividualSigla: unidadesMedida.sigla,
      quantidadeEstoque: produtos.quantidadeEstoque,
      estoqueMin: produtos.estoqueMin,
      estoqueMax: produtos.estoqueMax,
      areaEstoque: produtos.areaEstoque,
      setorEstoque: produtos.setorEstoque,
      curvaAbc: produtos.curvaAbc,
      quantidadeVariavel: produtos.quantidadeVariavel,
      toleranciaQuantidadePercentual: produtos.toleranciaQuantidadePercentual,
      precoVenda: produtos.precoVenda,
      // O card mostra o preco com a MESMA funcao do formulario (`calcularPrecoVenda`): ela precisa disto.
      custo: produtos.custo,
      margem: produtos.margem,
      auto: produtos.auto,
      quantidadeCaixa: produtos.quantidadeCaixa,
      fotoUrl: produtos.fotoUrl,
      criadoPorNome: perfisUsuarios.nome
    })
    .from(produtos)
    .leftJoin(gruposMercadorias, eq(produtos.grupoMercadoriaId, gruposMercadorias.id))
    .leftJoin(unidadesMedida, eq(produtos.unidadeIndividualId, unidadesMedida.id))
    .leftJoin(perfisUsuarios, eq(produtos.criadoPor, perfisUsuarios.usuarioId))
    .where(onde)
    .orderBy(...ordenacaoDaLista(filtro.ordenar))
    .limit(filtro.pageSize)
    .offset((filtro.page - 1) * filtro.pageSize);

  // Contagem SEPARADA, sem joins nem satelites: e so o total para a barra de paginacao.
  const [totalizador] = await banco.select({ total: count() }).from(produtos).where(onde);

  return { itens, total: Number(totalizador?.total ?? 0) };
}

/** Exportação de reconciliação compatível com o CSV do app Cadastro de Produtos. */
export async function exportarCatalogoCsvRepository(escopoEmpresas: string[]) {
  if (!escopoEmpresas.length) return [];
  return banco
    .select({
      id: produtos.id,
      loja: empresas.nome,
      codigo: produtos.codigo,
      codigoBarras: produtos.codigoBarras,
      codigoInterno: produtos.codigoInterno,
      produtoBaseId: produtos.produtoBaseId,
      nome: produtos.nomeCatalogo,
      descricao: produtos.descricao,
      grupo: gruposMercadorias.nome,
      tipo: produtos.tipo,
      status: produtos.status,
      custo: produtos.custo,
      precoVenda: produtos.precoVenda,
      margem: produtos.margem,
      quantidade: produtos.quantidadeIndividual,
      medidaBase: unidadesMedida.sigla,
      quantidadeCaixa: produtos.quantidadeCaixa,
      ncm: produtosFiscal.ncm,
      cest: produtosFiscal.cest,
      categoria: produtosFiscal.categoriaFiscal,
      cstPisCofins: produtosFiscal.cstPisCofins,
      icms: produtosFiscal.icms,
      reducaoIcms: produtosFiscal.reducaoIcms,
      aliquotaPis: produtosFiscal.aliquotaPis,
      aliquotaCofins: produtosFiscal.aliquotaCofins
    })
    .from(produtos)
    .innerJoin(empresas, eq(produtos.empresaId, empresas.id))
    .leftJoin(gruposMercadorias, eq(produtos.grupoMercadoriaId, gruposMercadorias.id))
    .leftJoin(unidadesMedida, eq(produtos.unidadeIndividualId, unidadesMedida.id))
    .leftJoin(produtosFiscal, eq(produtos.id, produtosFiscal.produtoId))
    .where(inArray(produtos.empresaId, escopoEmpresas))
    .orderBy(asc(empresas.nome), asc(produtos.descricao), asc(produtos.id));
}

/** Backup XLSX completo dos campos atualmente persistidos, sem saldo operacional em outro tenant. */
export async function buscarCatalogoParaBackupRepository(escopoEmpresas: string[]) {
  if (!escopoEmpresas.length) return { produtos: [], promocoes: [], conversoes: [] };
  const [itens, promocoes, conversoes] = await Promise.all([
    banco
      .select({
        id: produtos.id,
        loja: empresas.nome,
        empresaId: produtos.empresaId,
        codigo: produtos.codigo,
        codigoInterno: produtos.codigoInterno,
        codigoBarras: produtos.codigoBarras,
        produtoBaseId: produtos.produtoBaseId,
        nome: produtos.nomeCatalogo,
        descricao: produtos.descricao,
        pesavel: produtos.pesavel,
        marca: produtos.marca,
        grupo: gruposMercadorias.nome,
        tipo: produtos.tipo,
        status: produtos.status,
        quantidade: produtos.quantidadeIndividual,
        unidade: unidadesMedida.sigla,
        embalagem: produtos.embalagem,
        cDe: produtos.cDe,
        quantidadeCaixa: produtos.quantidadeCaixa,
        medidaCompra: produtos.medidaCompra,
        compraAproximada: produtos.compraAproximada,
        fotoUrl: produtos.fotoUrl,
        habilitarAjuda: produtos.habilitarAjuda,
        estoque: produtos.quantidadeEstoque,
        estoqueMin: produtos.estoqueMin,
        estoqueMax: produtos.estoqueMax,
        areaEstoque: produtos.areaEstoque,
        setorEstoque: produtos.setorEstoque,
        curvaAbc: produtos.curvaAbc,
        quantidadeVariavel: produtos.quantidadeVariavel,
        toleranciaQuantidadePercentual: produtos.toleranciaQuantidadePercentual,
        custo: produtos.custo,
        margem: produtos.margem,
        precoVenda: produtos.precoVenda,
        auto: produtos.auto,
        setorVenda1: produtos.setorVenda1,
        setorVenda2: produtos.setorVenda2,
        localVenda1: produtos.localVenda1,
        localVenda2: produtos.localVenda2,
        transformacaoPrecisao: produtosTransformacao.precisao,
        transformacaoQuantidade: produtosTransformacao.quantidade,
        transformacaoUnidade: produtosTransformacao.unidade,
        produtoReceituario: produtosTransformacao.produtoReceituario,
        refReceituario: produtosTransformacao.refReceituario,
        ncm: produtosFiscal.ncm,
        cest: produtosFiscal.cest,
        categoria: produtosFiscal.categoriaFiscal,
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
        estadoFiscal: produtosFiscal.estado,
        motivoFiscal: produtosFiscal.motivo,
        conferidoEm: produtosFiscal.conferidoEm,
        pctNcm: produtosFiscal.pctNcm,
        criadoPor: perfisUsuarios.nome,
        criadoEm: produtos.criadoEm
      })
      .from(produtos)
      .innerJoin(empresas, eq(produtos.empresaId, empresas.id))
      .leftJoin(gruposMercadorias, eq(produtos.grupoMercadoriaId, gruposMercadorias.id))
      .leftJoin(unidadesMedida, eq(produtos.unidadeIndividualId, unidadesMedida.id))
      .leftJoin(produtosFiscal, eq(produtos.id, produtosFiscal.produtoId))
      .leftJoin(produtosTransformacao, eq(produtos.id, produtosTransformacao.produtoId))
      .leftJoin(perfisUsuarios, eq(produtos.criadoPor, perfisUsuarios.usuarioId))
      .where(inArray(produtos.empresaId, escopoEmpresas))
      .orderBy(asc(empresas.nome), asc(produtos.descricao), asc(produtos.id)),
    banco
      .select({
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
      .innerJoin(produtos, eq(produtos.id, produtosPromocoes.produtoId))
      .where(inArray(produtos.empresaId, escopoEmpresas))
      .orderBy(asc(produtosPromocoes.produtoId), asc(produtosPromocoes.criadoEm)),
    banco
      .select({
        produtoId: produtosConversoes.produtoId,
        unidade: unidadesMedida.sigla,
        quantidade: produtosConversoes.quantidade,
        unidadesIndividuais: produtosConversoes.unidadesIndividuais
      })
      .from(produtosConversoes)
      .innerJoin(produtos, eq(produtos.id, produtosConversoes.produtoId))
      .leftJoin(unidadesMedida, eq(unidadesMedida.id, produtosConversoes.unidadeMedidaId))
      .where(inArray(produtos.empresaId, escopoEmpresas))
      .orderBy(asc(produtosConversoes.produtoId), asc(produtosConversoes.id))
  ]);
  return { produtos: itens, promocoes, conversoes };
}

/** Contagem por estado fiscal, somente leitura e restrita ao escopo das empresas permitidas. */
export async function buscarPanoramaFiscalProdutosRepository(escopoEmpresas: string[]) {
  if (!escopoEmpresas.length) return {};
  const estado = sql<string>`coalesce(${produtosFiscal.estado}, 'sem_registro')`;
  const linhas = await banco
    .select({ estado, total: count() })
    .from(produtos)
    .leftJoin(produtosFiscal, eq(produtosFiscal.produtoId, produtos.id))
    .where(inArray(produtos.empresaId, escopoEmpresas))
    .groupBy(estado);
  return Object.fromEntries(linhas.map((linha) => [linha.estado, linha.total]));
}

/** Promocoes SO dos produtos da pagina — o preco vigente (ADR-003) e derivado na leitura. */
export async function promocoesDosProdutosRepository(ids: string[]) {
  return banco
    .select({
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
    .where(inArray(produtosPromocoes.produtoId, ids.length ? ids : [SEM_RESULTADO]));
}

/**
 * Projecao reduzida para SELECIONAR produto. Sem fiscal, custo, margem ou preco.
 * Nunca devolve "tudo": ou casa com a busca, ou e um dos ids ja escolhidos (hidratacao).
 */
export async function opcoesDeProdutoRepository(entrada: {
  escopoEmpresas: string[];
  busca?: string | undefined;
  ids: string[];
  limite: number;
}): Promise<ProdutoOpcao[]> {
  const filtroDeTexto = entrada.busca
    ? or(
        ilike(produtos.descricao, termoDeBusca(entrada.busca)),
        ilike(produtos.codigoInterno, termoDeBusca(entrada.busca)),
        ilike(produtos.codigoBarras, termoDeBusca(entrada.busca)),
        ilike(produtos.marca, termoDeBusca(entrada.busca))
      )
    : undefined;
  const selecionados = entrada.ids.length ? inArray(produtos.id, entrada.ids) : undefined;

  return (
    banco
      .select({
        id: produtos.id,
        descricao: produtos.descricao,
        codigoInterno: produtos.codigoInterno,
        codigoBarras: produtos.codigoBarras,
        marca: produtos.marca,
        status: produtos.status
      })
      .from(produtos)
      // NAO acrescente campo aqui sem decidir o limite de novo. Esta projecao e compartilhada com
      // quem tem apenas `mercadorias_visualizar`, e `produtos-listagem.test.ts` fixa exatamente
      // estas seis chaves para nao vazar custo, margem e preco. Contexto de estoque para montar
      // pedido vem de `/api/compras/estoque`, que exige `estoque_produtos_visualizar`.
      .where(and(inArray(produtos.empresaId, entrada.escopoEmpresas), or(filtroDeTexto, selecionados)))
      .orderBy(asc(produtos.descricao))
      .limit(entrada.limite)
  );
}

/** Valores existentes para montar os filtros da tela, dentro do escopo do ator. */
export async function filtrosDeProdutoRepository(escopoEmpresas: string[]) {
  const setores = await banco
    .selectDistinct({ setorEstoque: produtos.setorEstoque })
    .from(produtos)
    .where(and(inArray(produtos.empresaId, escopoEmpresas), isNotNull(produtos.setorEstoque)))
    .orderBy(asc(produtos.setorEstoque));
  const grupos = await banco
    .select({ id: gruposMercadorias.id, nome: gruposMercadorias.nome })
    .from(gruposMercadorias)
    .where(inArray(gruposMercadorias.empresaId, escopoEmpresas))
    .orderBy(asc(gruposMercadorias.nome));
  return {
    setores: setores.map((linha) => linha.setorEstoque).filter((setor): setor is string => Boolean(setor)),
    grupos
  };
}
