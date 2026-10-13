import { and, asc, count, desc, eq, ilike, inArray, isNotNull, or, type SQL } from "drizzle-orm";
import type { OrdenacaoProdutos, ProdutoOpcao, ProdutoResumo } from "@padaria/shared/produtos";
import {
  gruposMercadorias,
  perfisUsuarios,
  produtos,
  produtosPromocoes,
  unidadesMedida
} from "@padaria/db/schema/cadastro";
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

export interface FiltroListaProdutos {
  escopoEmpresas: string[];
  busca?: string | undefined;
  status?: string | undefined;
  tipo?: string | undefined;
  grupoMercadoriaId?: string | undefined;
  setorEstoque?: string | undefined;
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
  if (filtro.busca) {
    const termo = termoDeBusca(filtro.busca);
    condicoes.push(
      or(
        ilike(produtos.descricao, termo),
        ilike(produtos.marca, termo),
        ilike(produtos.codigo, termo),
        ilike(produtos.codigoInterno, termo),
        ilike(produtos.codigoBarras, termo)
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
      marca: produtos.marca,
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
      precoVenda: produtos.precoVenda,
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
        status: produtos.status,
        unidade: unidadesMedida.sigla,
        quantidadeEstoque: produtos.quantidadeEstoque,
        estoqueMin: produtos.estoqueMin,
        estoqueMax: produtos.estoqueMax
      })
      .from(produtos)
      // `leftJoin`: produto sem unidade cadastrada continua aparecendo no seletor; perder a linha
      // seria pior que mostrar a quantidade sem sigla.
      .leftJoin(unidadesMedida, eq(unidadesMedida.id, produtos.unidadeIndividualId))
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
