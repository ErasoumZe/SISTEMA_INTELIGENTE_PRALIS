import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { fornecedores, produtos } from "@padaria/db/schema/cadastro";
import { pedidos, pedidosItens } from "@padaria/db/schema";
import type { PedidoDto, PedidoItemDto, PedidoRecorrencia, PedidoTipo } from "@padaria/shared/pedidos";
import { banco, executarComTransacaoOpcional, type ExecutorBanco } from "../banco/conexao.js";

export type ProdutoEstoqueLinha = {
  id: string;
  descricao: string;
  quantidadeEstoque: number;
  estoqueMin: number | null;
  estoqueMax: number | null;
};

function numeroOuNulo(valor: string | null): number | null {
  return valor === null ? null : Number(valor);
}

// Produtos da empresa com dados de estoque (para o pedido automatico e para snapshot dos manuais).
export async function buscarProdutosEstoqueRepository(
  empresaId: string,
  db: ExecutorBanco = banco
): Promise<ProdutoEstoqueLinha[]> {
  const linhas = await db
    .select({
      id: produtos.id,
      descricao: produtos.descricao,
      quantidadeEstoque: produtos.quantidadeEstoque,
      estoqueMin: produtos.estoqueMin,
      estoqueMax: produtos.estoqueMax
    })
    .from(produtos)
    .where(eq(produtos.empresaId, empresaId));
  return linhas.map((linha) => ({
    id: linha.id,
    descricao: linha.descricao ?? "Produto",
    quantidadeEstoque: Number(linha.quantidadeEstoque),
    estoqueMin: numeroOuNulo(linha.estoqueMin),
    estoqueMax: numeroOuNulo(linha.estoqueMax)
  }));
}

export type ItemPedidoParaCriar = {
  produtoId: string;
  fornecedorId: string | null;
  descricaoProduto: string;
  quantidade: number;
  estoqueAtual: number | null;
  estoqueMin: number | null;
  estoqueMax: number | null;
};

export async function criarPedidoRepository(
  input: {
    empresaId: string;
    tipo: PedidoTipo;
    dataAgendada: string | null;
    recorrencia: PedidoRecorrencia;
    observacao: string | null;
    criadoPor: string;
    itens: ItemPedidoParaCriar[];
  },
  db?: ExecutorBanco
): Promise<{ id: string }> {
  return executarComTransacaoOpcional(db, async (tx) => {
    const [pedido] = await tx
      .insert(pedidos)
      .values({
        empresaId: input.empresaId,
        tipo: input.tipo,
        status: "rascunho",
        dataAgendada: input.dataAgendada ? new Date(input.dataAgendada) : null,
        recorrencia: input.recorrencia,
        observacao: input.observacao,
        criadoPor: input.criadoPor
      })
      .returning({ id: pedidos.id });
    if (!pedido) throw new Error("Pedido nao criado");
    await inserirItens(pedido.id, input.itens, tx);
    return { id: pedido.id };
  });
}

async function inserirItens(pedidoId: string, itens: ItemPedidoParaCriar[], tx: ExecutorBanco) {
  if (!itens.length) return;
  await tx.insert(pedidosItens).values(
    itens.map((item) => ({
      pedidoId,
      produtoId: item.produtoId,
      fornecedorId: item.fornecedorId,
      descricaoProduto: item.descricaoProduto,
      quantidade: String(item.quantidade),
      estoqueAtual: item.estoqueAtual === null ? null : String(item.estoqueAtual),
      estoqueMin: item.estoqueMin === null ? null : String(item.estoqueMin),
      estoqueMax: item.estoqueMax === null ? null : String(item.estoqueMax)
    }))
  );
}

export async function atualizarPedidoRepository(
  pedidoId: string,
  input: {
    dataAgendada: string | null | undefined;
    recorrencia: PedidoRecorrencia | undefined;
    observacao: string | null | undefined;
    itens: ItemPedidoParaCriar[];
  },
  db?: ExecutorBanco
): Promise<void> {
  return executarComTransacaoOpcional(db, async (tx) => {
    await tx
      .update(pedidos)
      .set({
        ...(input.dataAgendada !== undefined
          ? { dataAgendada: input.dataAgendada ? new Date(input.dataAgendada) : null }
          : {}),
        ...(input.recorrencia !== undefined ? { recorrencia: input.recorrencia } : {}),
        ...(input.observacao !== undefined ? { observacao: input.observacao } : {}),
        atualizadoEm: new Date()
      })
      .where(eq(pedidos.id, pedidoId));
    await tx.delete(pedidosItens).where(eq(pedidosItens.pedidoId, pedidoId));
    await inserirItens(pedidoId, input.itens, tx);
  });
}

export async function aprovarPedidoRepository(
  pedidoId: string,
  aprovadoPor: string,
  db: ExecutorBanco = banco
): Promise<void> {
  await db
    .update(pedidos)
    .set({ status: "aprovado", aprovadoPor, aprovadoEm: new Date(), atualizadoEm: new Date() })
    .where(eq(pedidos.id, pedidoId));
}

export type PedidoLinhaBase = {
  id: string;
  empresaId: string;
  status: string;
  tipo: string;
};

export async function buscarPedidoBaseRepository(
  pedidoId: string,
  db: ExecutorBanco = banco
): Promise<PedidoLinhaBase | null> {
  const [pedido] = await db
    .select({ id: pedidos.id, empresaId: pedidos.empresaId, status: pedidos.status, tipo: pedidos.tipo })
    .from(pedidos)
    .where(eq(pedidos.id, pedidoId))
    .limit(1);
  return pedido ?? null;
}

function serializarCabecalho(linha: {
  id: string;
  empresaId: string;
  tipo: string;
  status: string;
  dataAgendada: Date | null;
  recorrencia: string;
  observacao: string | null;
  criadoEm: Date;
  aprovadoEm: Date | null;
  totalItens: number;
}): PedidoDto {
  return {
    id: linha.id,
    empresaId: linha.empresaId,
    tipo: linha.tipo as PedidoTipo,
    status: linha.status as PedidoDto["status"],
    dataAgendada: linha.dataAgendada ? linha.dataAgendada.toISOString() : null,
    recorrencia: linha.recorrencia as PedidoRecorrencia,
    observacao: linha.observacao,
    totalItens: linha.totalItens,
    criadoEm: linha.criadoEm.toISOString(),
    aprovadoEm: linha.aprovadoEm ? linha.aprovadoEm.toISOString() : null
  };
}

export async function listarPedidosRepository(
  filtros: { empresaId?: string | undefined; status?: string | undefined },
  empresasPermitidasIds: string[] | null,
  db: ExecutorBanco = banco
): Promise<PedidoDto[]> {
  const condicoes = [];
  if (filtros.empresaId) condicoes.push(eq(pedidos.empresaId, filtros.empresaId));
  if (filtros.status) condicoes.push(eq(pedidos.status, filtros.status));
  if (empresasPermitidasIds) condicoes.push(inArray(pedidos.empresaId, empresasPermitidasIds));

  const linhas = await db
    .select({
      id: pedidos.id,
      empresaId: pedidos.empresaId,
      tipo: pedidos.tipo,
      status: pedidos.status,
      dataAgendada: pedidos.dataAgendada,
      recorrencia: pedidos.recorrencia,
      observacao: pedidos.observacao,
      criadoEm: pedidos.criadoEm,
      aprovadoEm: pedidos.aprovadoEm,
      totalItens: sql<number>`(select count(*)::int from ${pedidosItens} where ${pedidosItens.pedidoId} = ${pedidos.id})`
    })
    .from(pedidos)
    .where(condicoes.length ? and(...condicoes) : undefined)
    .orderBy(desc(pedidos.criadoEm));
  return linhas.map(serializarCabecalho);
}

export async function obterPedidoDetalheRepository(
  pedidoId: string,
  db: ExecutorBanco = banco
): Promise<PedidoDto | null> {
  const [cabecalho] = await db
    .select({
      id: pedidos.id,
      empresaId: pedidos.empresaId,
      tipo: pedidos.tipo,
      status: pedidos.status,
      dataAgendada: pedidos.dataAgendada,
      recorrencia: pedidos.recorrencia,
      observacao: pedidos.observacao,
      criadoEm: pedidos.criadoEm,
      aprovadoEm: pedidos.aprovadoEm
    })
    .from(pedidos)
    .where(eq(pedidos.id, pedidoId))
    .limit(1);
  if (!cabecalho) return null;

  const itens: PedidoItemDto[] = await db
    .select({
      id: pedidosItens.id,
      produtoId: pedidosItens.produtoId,
      descricaoProduto: pedidosItens.descricaoProduto,
      fornecedorId: pedidosItens.fornecedorId,
      fornecedorNome: fornecedores.nome,
      quantidade: pedidosItens.quantidade,
      estoqueAtual: pedidosItens.estoqueAtual,
      estoqueMin: pedidosItens.estoqueMin,
      estoqueMax: pedidosItens.estoqueMax
    })
    .from(pedidosItens)
    .leftJoin(fornecedores, eq(fornecedores.id, pedidosItens.fornecedorId))
    .where(eq(pedidosItens.pedidoId, pedidoId));

  return { ...serializarCabecalho({ ...cabecalho, totalItens: itens.length }), itens };
}
