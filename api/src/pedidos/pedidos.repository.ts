import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { fornecedores, produtos } from "@padaria/db/schema/cadastro";
import {
  estoqueMovimentos,
  pedidos,
  pedidosEventos,
  pedidosDevolucoes,
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
import { banco, type ExecutorBanco, type TransacaoBanco } from "../banco/conexao.js";

export type ProdutoEstoqueLinha = {
  id: string;
  descricao: string;
  quantidadeEstoque: number;
  estoqueMin: number | null;
  estoqueMax: number | null;
  liberadoCompra: boolean;
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
      estoqueMax: produtos.estoqueMax,
      liberadoCompra: produtos.liberadoCompra
    })
    .from(produtos)
    .where(eq(produtos.empresaId, empresaId));
  return linhas.map((linha) => ({
    id: linha.id,
    descricao: linha.descricao ?? "Produto",
    quantidadeEstoque: Number(linha.quantidadeEstoque),
    estoqueMin: numeroOuNulo(linha.estoqueMin),
    estoqueMax: numeroOuNulo(linha.estoqueMax),
    liberadoCompra: linha.liberadoCompra
  }));
}

/**
 * Autor do evento de situacao: sempre um USUARIO (cancelar, receber). Os eventos de compra automatica
 * (autor = a resposta do fornecedor) nascem na adjudicacao da rodada, nao aqui. O banco aceita usuario,
 * cotacao legada OU proposta como autor (CHECK pedidos_eventos_autor_check); este caminho so grava usuario.
 */
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

export type PedidoLinhaBase = {
  id: string;
  empresaId: string;
  status: string;
  tipo: string;
  fornecedorId: string | null;
};

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
      cotacaoId: pedidosEventos.cotacaoId,
      propostaId: pedidosEventos.propostaId,
      criadoEm: pedidosEventos.criadoEm
    })
    .from(pedidosEventos)
    // leftJoin: a compra automatica (e o Retornado da cotacao legada) nao tem usuario — quem agiu foi o
    // fornecedor, pelo link.
    .leftJoin(perfisUsuarios, eq(perfisUsuarios.usuarioId, pedidosEventos.criadoPor))
    .where(eq(pedidosEventos.pedidoId, pedidoId))
    .orderBy(asc(pedidosEventos.criadoEm))
    .then((linhas) =>
      linhas.map(({ cotacaoId, propostaId, ...linha }) => ({
        ...linha,
        status: linha.status as PedidoStatusNovo,
        criadoPorNome:
          linha.criadoPorNome ??
          (cotacaoId || propostaId ? `${cabecalho.fornecedorNome ?? "Fornecedor"} (pelo link)` : "Sistema"),
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
  const devolvidos = itens.length
    ? await db
        .select({
          pedidoItemId: pedidosDevolucoes.pedidoItemId,
          quantidade: sql<string>`sum(${pedidosDevolucoes.quantidade})`
        })
        .from(pedidosDevolucoes)
        .where(
          inArray(
            pedidosDevolucoes.pedidoItemId,
            itens.map((item) => item.id)
          )
        )
        .groupBy(pedidosDevolucoes.pedidoItemId)
    : [];
  const recebidoPorItem = new Map(recebidos.map((item) => [item.pedidoItemId, Number(item.quantidadeRecebida)]));
  const devolvidoPorItem = new Map(devolvidos.map((item) => [item.pedidoItemId, Number(item.quantidade)]));
  return itens.map((item) => {
    const recebida = recebidoPorItem.get(item.id) ?? 0;
    const devolvida = devolvidoPorItem.get(item.id) ?? 0;
    const quantidade = Number(item.quantidade);
    return {
      id: item.id,
      produtoId: item.produtoId,
      descricaoProduto: item.descricaoProduto,
      quantidade: item.quantidade,
      quantidadeRecebida: String(recebida),
      quantidadeDevolvida: String(devolvida),
      // Doc 58 §7: devolveu, fechou — o resto nao fica esperando.
      quantidadePendente: String(devolvida > 0 ? 0 : quantidade - recebida),
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

export type ItemDoRecebimentoGravado = {
  pedidoItemId: string;
  quantidadeConferida: number;
  quantidadeDevolvida: number;
  motivoDevolucao: string | null;
};

export async function buscarRecebimentoPorIdempotenciaRepository(
  empresaId: string,
  idempotenciaChave: string,
  db: ExecutorBanco
): Promise<{
  id: string;
  pedidoId: string;
  observacao: string | null;
  itens: ItemDoRecebimentoGravado[];
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
  const devolucoes = await db
    .select({
      pedidoItemId: pedidosDevolucoes.pedidoItemId,
      quantidade: pedidosDevolucoes.quantidade,
      motivo: pedidosDevolucoes.motivo
    })
    .from(pedidosDevolucoes)
    .where(eq(pedidosDevolucoes.pedidoRecebimentoId, recebimento.id));
  const porItem = new Map<string, ItemDoRecebimentoGravado>();
  const doItem = (pedidoItemId: string) => {
    const atual = porItem.get(pedidoItemId) ?? {
      pedidoItemId,
      quantidadeConferida: 0,
      quantidadeDevolvida: 0,
      motivoDevolucao: null
    };
    porItem.set(pedidoItemId, atual);
    return atual;
  };
  for (const movimento of movimentos) doItem(movimento.pedidoItemId).quantidadeConferida = Number(movimento.quantidade);
  for (const devolucao of devolucoes) {
    const item = doItem(devolucao.pedidoItemId);
    item.quantidadeDevolvida = Number(devolucao.quantidade);
    item.motivoDevolucao = devolucao.motivo;
  }
  return { ...recebimento, itens: [...porItem.values()] };
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

/** Doc 58 §7: o que voltou com o entregador, com o motivo. Nao mexe no estoque. */
export async function registrarDevolucaoRepository(
  input: {
    empresaId: string;
    pedidoId: string;
    pedidoItemId: string;
    pedidoRecebimentoId: string;
    quantidade: number;
    motivo: string;
    devolvidoPor: string;
  },
  db: ExecutorBanco
): Promise<void> {
  await db.insert(pedidosDevolucoes).values({ ...input, quantidade: String(input.quantidade) });
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
