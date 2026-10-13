import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { fornecedores, produtos } from "@padaria/db/schema/cadastro";
import {
  estoqueMovimentos,
  pedidos,
  pedidosEventos,
  pedidosItens,
  pedidosRecebimentos,
  perfisUsuarios
} from "@padaria/db/schema";
import type {
  PedidoDto,
  PedidoEventoDto,
  PedidoItemDto,
  PedidoRecorrencia,
  PedidoStatus,
  PedidoStatusNovo,
  PedidoTipo
} from "@padaria/shared/pedidos";
import { banco, executarComTransacaoOpcional, type ExecutorBanco, type TransacaoBanco } from "../banco/conexao.js";

export type ProdutoEstoqueLinha = {
  id: string;
  descricao: string;
  quantidadeEstoque: number;
  estoqueMin: number | null;
  estoqueMax: number | null;
};

export type ItemPedidoParaCriar = {
  produtoId: string;
  descricaoProduto: string;
  quantidade: number;
  estoqueAtual: number | null;
  estoqueMin: number | null;
  estoqueMax: number | null;
};

function numeroOuNulo(valor: string | null): number | null {
  return valor === null ? null : Number(valor);
}

function serializarCabecalho(linha: {
  id: string;
  empresaId: string;
  tipo: string;
  status: string;
  fornecedorId: string | null;
  fornecedorNome: string | null;
  fornecedorWhatsapp: string | null;
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
    status: linha.status as PedidoStatus,
    fornecedorId: linha.fornecedorId,
    fornecedorNome: linha.fornecedorNome,
    fornecedorWhatsapp: linha.fornecedorWhatsapp,
    dataAgendada: linha.dataAgendada ? linha.dataAgendada.toISOString() : null,
    recorrencia: linha.recorrencia as PedidoRecorrencia,
    observacao: linha.observacao,
    totalItens: linha.totalItens,
    criadoEm: linha.criadoEm.toISOString(),
    aprovadoEm: linha.aprovadoEm ? linha.aprovadoEm.toISOString() : null
  };
}

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

export async function fornecedorPertenceAEmpresaRepository(
  fornecedorId: string,
  empresaId: string,
  db: ExecutorBanco = banco
): Promise<boolean> {
  const [fornecedor] = await db
    .select({ id: fornecedores.id })
    .from(fornecedores)
    .where(and(eq(fornecedores.id, fornecedorId), eq(fornecedores.empresaId, empresaId)))
    .limit(1);
  return Boolean(fornecedor);
}

async function inserirItens(pedidoId: string, itens: ItemPedidoParaCriar[], tx: ExecutorBanco): Promise<void> {
  await tx.insert(pedidosItens).values(
    itens.map((item) => ({
      pedidoId,
      produtoId: item.produtoId,
      fornecedorId: null,
      descricaoProduto: item.descricaoProduto,
      quantidade: String(item.quantidade),
      estoqueAtual: item.estoqueAtual === null ? null : String(item.estoqueAtual),
      estoqueMin: item.estoqueMin === null ? null : String(item.estoqueMin),
      estoqueMax: item.estoqueMax === null ? null : String(item.estoqueMax)
    }))
  );
}

async function inserirEvento(
  input: {
    empresaId: string;
    pedidoId: string;
    status: PedidoStatusNovo;
    observacao: string | null;
    criadoPor: string;
  },
  tx: ExecutorBanco
): Promise<void> {
  await tx.insert(pedidosEventos).values(input);
}

export async function criarPedidoRepository(
  input: {
    empresaId: string;
    fornecedorId: string;
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
        fornecedorId: input.fornecedorId,
        tipo: input.tipo,
        status: "a_fazer",
        dataAgendada: input.dataAgendada ? new Date(input.dataAgendada) : null,
        recorrencia: input.recorrencia,
        observacao: input.observacao,
        criadoPor: input.criadoPor
      })
      .returning({ id: pedidos.id });
    if (!pedido) throw new Error("Pedido nao criado");
    await inserirItens(pedido.id, input.itens, tx);
    await inserirEvento(
      {
        empresaId: input.empresaId,
        pedidoId: pedido.id,
        status: "a_fazer",
        observacao: input.observacao,
        criadoPor: input.criadoPor
      },
      tx
    );
    return { id: pedido.id };
  });
}

export async function atualizarPedidoRepository(
  pedidoId: string,
  input: {
    fornecedorId: string | undefined;
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
        ...(input.fornecedorId !== undefined ? { fornecedorId: input.fornecedorId } : {}),
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

export type PedidoLinhaBase = {
  id: string;
  empresaId: string;
  status: string;
  tipo: string;
  fornecedorId: string | null;
};

export async function buscarPedidoBaseRepository(
  pedidoId: string,
  db: ExecutorBanco = banco
): Promise<PedidoLinhaBase | null> {
  const [pedido] = await db
    .select({
      id: pedidos.id,
      empresaId: pedidos.empresaId,
      status: pedidos.status,
      tipo: pedidos.tipo,
      fornecedorId: pedidos.fornecedorId
    })
    .from(pedidos)
    .where(eq(pedidos.id, pedidoId))
    .limit(1);
  return pedido ?? null;
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
      fornecedorId: pedidos.fornecedorId,
      fornecedorNome: fornecedores.nome,
      fornecedorWhatsapp: fornecedores.whatsapp,
      dataAgendada: pedidos.dataAgendada,
      recorrencia: pedidos.recorrencia,
      observacao: pedidos.observacao,
      criadoEm: pedidos.criadoEm,
      aprovadoEm: pedidos.aprovadoEm,
      totalItens: sql<number>`(select count(*)::int from ${pedidosItens} where ${pedidosItens.pedidoId} = ${pedidos.id})`
    })
    .from(pedidos)
    .leftJoin(fornecedores, eq(fornecedores.id, pedidos.fornecedorId))
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
      fornecedorId: pedidos.fornecedorId,
      fornecedorNome: fornecedores.nome,
      fornecedorWhatsapp: fornecedores.whatsapp,
      dataAgendada: pedidos.dataAgendada,
      recorrencia: pedidos.recorrencia,
      observacao: pedidos.observacao,
      criadoEm: pedidos.criadoEm,
      aprovadoEm: pedidos.aprovadoEm
    })
    .from(pedidos)
    .leftJoin(fornecedores, eq(fornecedores.id, pedidos.fornecedorId))
    .where(eq(pedidos.id, pedidoId))
    .limit(1);
  if (!cabecalho) return null;
  const itens = await listarItensDoPedidoRepository(pedidoId, db);
  const eventos: PedidoEventoDto[] = await db
    .select({
      id: pedidosEventos.id,
      status: pedidosEventos.status,
      observacao: pedidosEventos.observacao,
      criadoPor: pedidosEventos.criadoPor,
      criadoPorNome: perfisUsuarios.nome,
      criadoEm: pedidosEventos.criadoEm
    })
    .from(pedidosEventos)
    .innerJoin(perfisUsuarios, eq(perfisUsuarios.usuarioId, pedidosEventos.criadoPor))
    .where(eq(pedidosEventos.pedidoId, pedidoId))
    .orderBy(asc(pedidosEventos.criadoEm))
    .then((linhas) =>
      linhas.map((linha) => ({
        ...linha,
        status: linha.status as PedidoStatusNovo,
        criadoEm: linha.criadoEm.toISOString()
      }))
    );
  return { ...serializarCabecalho({ ...cabecalho, totalItens: itens.length }), itens, eventos };
}

export type ItemPedidoRecebimentoLinha = {
  id: string;
  produtoId: string | null;
  descricaoProduto: string;
  quantidade: number;
  quantidadeRecebida: number;
};

export async function listarItensDoPedidoRepository(
  pedidoId: string,
  db: ExecutorBanco = banco
): Promise<PedidoItemDto[]> {
  const itens = await db
    .select({
      id: pedidosItens.id,
      produtoId: pedidosItens.produtoId,
      descricaoProduto: pedidosItens.descricaoProduto,
      quantidade: pedidosItens.quantidade,
      estoqueAtual: pedidosItens.estoqueAtual,
      estoqueMin: pedidosItens.estoqueMin,
      estoqueMax: pedidosItens.estoqueMax
    })
    .from(pedidosItens)
    .where(eq(pedidosItens.pedidoId, pedidoId));
  const recebidos = itens.length
    ? await db
        .select({
          pedidoItemId: estoqueMovimentos.pedidoItemId,
          quantidadeRecebida: sql<string>`sum(${estoqueMovimentos.quantidade})`
        })
        .from(estoqueMovimentos)
        .where(
          inArray(
            estoqueMovimentos.pedidoItemId,
            itens.map((item) => item.id)
          )
        )
        .groupBy(estoqueMovimentos.pedidoItemId)
    : [];
  const recebidoPorItem = new Map(recebidos.map((item) => [item.pedidoItemId, Number(item.quantidadeRecebida)]));
  return itens.map((item) => {
    const recebida = recebidoPorItem.get(item.id) ?? 0;
    const quantidade = Number(item.quantidade);
    return {
      id: item.id,
      produtoId: item.produtoId,
      descricaoProduto: item.descricaoProduto,
      quantidade: item.quantidade,
      quantidadeRecebida: String(recebida),
      quantidadePendente: String(quantidade - recebida),
      estoqueAtual: item.estoqueAtual,
      estoqueMin: item.estoqueMin,
      estoqueMax: item.estoqueMax
    };
  });
}

export async function travarPedidoRepository(pedidoId: string, db: TransacaoBanco): Promise<PedidoLinhaBase | null> {
  const [pedido] = await db
    .select({
      id: pedidos.id,
      empresaId: pedidos.empresaId,
      status: pedidos.status,
      tipo: pedidos.tipo,
      fornecedorId: pedidos.fornecedorId
    })
    .from(pedidos)
    .where(eq(pedidos.id, pedidoId))
    .for("update");
  return pedido ?? null;
}

export async function atualizarSituacaoPedidoRepository(
  input: {
    pedidoId: string;
    empresaId: string;
    status: PedidoStatusNovo;
    observacao: string | null;
    criadoPor: string;
  },
  db: ExecutorBanco
): Promise<void> {
  await db
    .update(pedidos)
    .set({ status: input.status, atualizadoEm: new Date() })
    .where(eq(pedidos.id, input.pedidoId));
  await inserirEvento(input, db);
}

export async function buscarRecebimentoPorIdempotenciaRepository(
  empresaId: string,
  idempotenciaChave: string,
  db: ExecutorBanco
): Promise<{
  id: string;
  pedidoId: string;
  observacao: string | null;
  itens: Array<{ pedidoItemId: string; quantidadeConferida: number }>;
} | null> {
  const [recebimento] = await db
    .select({
      id: pedidosRecebimentos.id,
      pedidoId: pedidosRecebimentos.pedidoId,
      observacao: pedidosRecebimentos.observacao
    })
    .from(pedidosRecebimentos)
    .where(
      and(eq(pedidosRecebimentos.empresaId, empresaId), eq(pedidosRecebimentos.idempotenciaChave, idempotenciaChave))
    )
    .limit(1);
  if (!recebimento) return null;
  const movimentos = await db
    .select({
      pedidoItemId: estoqueMovimentos.pedidoItemId,
      quantidade: estoqueMovimentos.quantidade
    })
    .from(estoqueMovimentos)
    .where(eq(estoqueMovimentos.pedidoRecebimentoId, recebimento.id));
  return {
    ...recebimento,
    itens: movimentos.map((item) => ({
      pedidoItemId: item.pedidoItemId,
      quantidadeConferida: Number(item.quantidade)
    }))
  };
}

export async function criarRecebimentoRepository(
  input: {
    empresaId: string;
    pedidoId: string;
    observacao: string | null;
    idempotenciaChave: string;
    recebidoPor: string;
  },
  db: ExecutorBanco
): Promise<string | null> {
  const [recebimento] = await db
    .insert(pedidosRecebimentos)
    .values(input)
    .onConflictDoNothing({ target: [pedidosRecebimentos.empresaId, pedidosRecebimentos.idempotenciaChave] })
    .returning({ id: pedidosRecebimentos.id });
  return recebimento?.id ?? null;
}

export async function travarProdutosRepository(
  empresaId: string,
  produtosIds: string[],
  db: TransacaoBanco
): Promise<Array<{ id: string; quantidadeEstoque: number }>> {
  const ids = [...new Set(produtosIds)].sort();
  if (!ids.length) return [];
  const linhas = await db
    .select({ id: produtos.id, quantidadeEstoque: produtos.quantidadeEstoque })
    .from(produtos)
    .where(and(eq(produtos.empresaId, empresaId), inArray(produtos.id, ids)))
    .orderBy(asc(produtos.id))
    .for("update");
  return linhas.map((linha) => ({ id: linha.id, quantidadeEstoque: Number(linha.quantidadeEstoque) }));
}

export async function registrarMovimentoRecebimentoRepository(
  input: {
    empresaId: string;
    pedidoItemId: string;
    pedidoRecebimentoId: string;
    produtoId: string;
    quantidade: number;
    saldoAnterior: number;
    saldoPosterior: number;
  },
  db: ExecutorBanco
): Promise<void> {
  await db.insert(estoqueMovimentos).values({
    empresaId: input.empresaId,
    pedidoItemId: input.pedidoItemId,
    pedidoRecebimentoId: input.pedidoRecebimentoId,
    produtoId: input.produtoId,
    quantidade: String(input.quantidade),
    saldoAnterior: String(input.saldoAnterior),
    saldoPosterior: String(input.saldoPosterior)
  });
  await db
    .update(produtos)
    .set({ quantidadeEstoque: String(input.saldoPosterior), atualizadoEm: new Date() })
    .where(eq(produtos.id, input.produtoId));
}
