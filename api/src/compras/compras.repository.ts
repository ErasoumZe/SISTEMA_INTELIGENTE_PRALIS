import { and, asc, desc, eq, gte, lt, or } from "drizzle-orm";
import {
  conferenciasEstoque,
  estoqueMovimentos,
  gruposMercadorias,
  pedidosRecebimentos,
  perfisUsuarios,
  produtos,
  unidadesMedida
} from "@padaria/db/schema";
import type {
  ConferenciaEstoqueDto,
  ConferenciaEstoquePayload,
  EstoqueMovimentoDto,
  EstoqueMovimentosQuery,
  EstoqueProdutosQuery,
  ProdutoEstoqueDto
} from "@padaria/shared/compras";
import { banco, type ExecutorBanco } from "../banco/conexao.js";

export async function listarEstoqueMovimentosRepository(
  filtros: EstoqueMovimentosQuery,
  db: ExecutorBanco = banco
): Promise<EstoqueMovimentoDto[]> {
  const condicoes = [eq(estoqueMovimentos.empresaId, filtros.empresaId)];
  if (filtros.produtoId) condicoes.push(eq(estoqueMovimentos.produtoId, filtros.produtoId));
  if (filtros.localEstoque) condicoes.push(eq(produtos.setorEstoque, filtros.localEstoque));
  if (filtros.dataInicio) condicoes.push(gte(estoqueMovimentos.criadoEm, new Date(filtros.dataInicio)));
  if (filtros.dataFim) condicoes.push(lt(estoqueMovimentos.criadoEm, new Date(filtros.dataFim)));
  const linhas = await db
    .select({
      id: estoqueMovimentos.id,
      produtoId: estoqueMovimentos.produtoId,
      produtoDescricao: produtos.descricao,
      localEstoque: produtos.setorEstoque,
      pedidoId: pedidosRecebimentos.pedidoId,
      pedidoRecebimentoId: estoqueMovimentos.pedidoRecebimentoId,
      tipo: estoqueMovimentos.tipo,
      quantidade: estoqueMovimentos.quantidade,
      saldoAnterior: estoqueMovimentos.saldoAnterior,
      saldoPosterior: estoqueMovimentos.saldoPosterior,
      recebidoPorId: pedidosRecebimentos.recebidoPor,
      recebidoPorNome: perfisUsuarios.nome,
      recebidoEm: pedidosRecebimentos.recebidoEm,
      criadoEm: estoqueMovimentos.criadoEm
    })
    .from(estoqueMovimentos)
    .innerJoin(produtos, eq(produtos.id, estoqueMovimentos.produtoId))
    .innerJoin(pedidosRecebimentos, eq(pedidosRecebimentos.id, estoqueMovimentos.pedidoRecebimentoId))
    .innerJoin(perfisUsuarios, eq(perfisUsuarios.usuarioId, pedidosRecebimentos.recebidoPor))
    .where(and(...condicoes))
    .orderBy(desc(estoqueMovimentos.criadoEm));
  return linhas.map((linha) => ({
    ...linha,
    tipo: linha.tipo as "recebimento_compra",
    recebidoEm: linha.recebidoEm.toISOString(),
    criadoEm: linha.criadoEm.toISOString()
  }));
}

export async function listarEstoqueProdutosRepository(
  filtros: EstoqueProdutosQuery,
  db: ExecutorBanco = banco
): Promise<ProdutoEstoqueDto[]> {
  const condicoes = [eq(produtos.empresaId, filtros.empresaId)];
  if (filtros.grupoMercadoriaId) condicoes.push(eq(produtos.grupoMercadoriaId, filtros.grupoMercadoriaId));
  if (filtros.areaEstoque) condicoes.push(eq(produtos.areaEstoque, filtros.areaEstoque));
  if (filtros.localEstoque) condicoes.push(eq(produtos.setorEstoque, filtros.localEstoque));
  if (filtros.curvaAbc) condicoes.push(eq(produtos.curvaAbc, filtros.curvaAbc));
  if (filtros.localVenda) {
    condicoes.push(or(eq(produtos.localVenda1, filtros.localVenda), eq(produtos.localVenda2, filtros.localVenda))!);
  }
  const linhas = await db
    .select({
      id: produtos.id,
      descricao: produtos.descricao,
      grupoMercadoriaId: produtos.grupoMercadoriaId,
      grupo: gruposMercadorias.nome,
      quantidadeEstoque: produtos.quantidadeEstoque,
      estoqueMin: produtos.estoqueMin,
      estoqueMax: produtos.estoqueMax,
      areaEstoque: produtos.areaEstoque,
      localVenda1: produtos.localVenda1,
      localVenda2: produtos.localVenda2,
      localEstoque: produtos.setorEstoque,
      curvaAbc: produtos.curvaAbc,
      unidade: unidadesMedida.sigla
    })
    .from(produtos)
    .leftJoin(gruposMercadorias, eq(gruposMercadorias.id, produtos.grupoMercadoriaId))
    // `leftJoin`: produto sem unidade cadastrada continua na listagem; perder a linha seria pior
    // que mostrar a quantidade sem sigla.
    .leftJoin(unidadesMedida, eq(unidadesMedida.id, produtos.unidadeIndividualId))
    .where(and(...condicoes))
    .orderBy(asc(produtos.descricao));
  return linhas.map((linha) => ({
    id: linha.id,
    descricao: linha.descricao,
    grupoMercadoriaId: linha.grupoMercadoriaId,
    grupo: linha.grupo,
    quantidadeEstoque: linha.quantidadeEstoque,
    estoqueMin: linha.estoqueMin,
    estoqueMax: linha.estoqueMax,
    areaEstoque: linha.areaEstoque,
    localVenda: [linha.localVenda1, linha.localVenda2].filter((local): local is string => Boolean(local)),
    localEstoque: linha.localEstoque,
    curvaAbc: linha.curvaAbc,
    unidade: linha.unidade
  }));
}

export async function listarConferenciasEstoqueRepository(
  empresaId: string,
  db: ExecutorBanco = banco
): Promise<ConferenciaEstoqueDto[]> {
  const linhas = await db
    .select({
      id: conferenciasEstoque.id,
      empresaId: conferenciasEstoque.empresaId,
      grupoMercadoriaId: conferenciasEstoque.grupoMercadoriaId,
      grupo: gruposMercadorias.nome,
      areaEstoque: conferenciasEstoque.areaEstoque,
      localVenda: conferenciasEstoque.localVenda,
      localEstoque: conferenciasEstoque.localEstoque,
      curvaAbc: conferenciasEstoque.curvaAbc,
      agendadaPara: conferenciasEstoque.agendadaPara,
      observacao: conferenciasEstoque.observacao,
      status: conferenciasEstoque.status,
      criadoEm: conferenciasEstoque.criadoEm
    })
    .from(conferenciasEstoque)
    .leftJoin(gruposMercadorias, eq(gruposMercadorias.id, conferenciasEstoque.grupoMercadoriaId))
    .where(eq(conferenciasEstoque.empresaId, empresaId))
    .orderBy(desc(conferenciasEstoque.agendadaPara));
  return linhas.map((linha) => ({
    ...linha,
    curvaAbc: linha.curvaAbc,
    status: linha.status as ConferenciaEstoqueDto["status"],
    agendadaPara: linha.agendadaPara.toISOString(),
    criadoEm: linha.criadoEm.toISOString()
  }));
}

export async function criarConferenciaEstoqueRepository(
  input: ConferenciaEstoquePayload & { criadoPor: string },
  db: ExecutorBanco = banco
): Promise<{ id: string }> {
  const [conferencia] = await db
    .insert(conferenciasEstoque)
    .values({
      ...input,
      agendadaPara: new Date(input.agendadaPara)
    })
    .returning({ id: conferenciasEstoque.id });
  if (!conferencia) throw new Error("Conferencia de estoque nao criada");
  return conferencia;
}
