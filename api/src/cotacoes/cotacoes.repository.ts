import { and, desc, eq, inArray, ne } from "drizzle-orm";
import {
  empresas,
  fornecedores,
  pedidos,
  pedidosCotacoes,
  pedidosCotacoesItens,
  pedidosItens,
  produtos,
  unidadesMedida
} from "@padaria/db/schema";
import type { TipoDescontoCotacao } from "@padaria/shared/compras";
import { banco, type ExecutorBanco, type TransacaoBanco } from "../banco/conexao.js";

/**
 * R-216 — persistencia da cotacao de fornecedor.
 *
 * Este arquivo so le e grava. Quem decide se o link vale, se o pedido aceita resposta e quanto
 * deu o total e o service — com a funcao pura de `@padaria/shared/compras`.
 */

export type CotacaoLinha = {
  id: string;
  empresaId: string;
  pedidoId: string;
  status: "aberta" | "respondida" | "revogada";
  expiraEm: Date;
  descontoGeralTipo: TipoDescontoCotacao | null;
  descontoGeralValor: string | null;
  observacao: string | null;
  prazoEntrega: string | null;
  condicaoPagamento: string | null;
  criadoEm: Date;
  respondidaEm: Date | null;
};

const colunasCotacao = {
  id: pedidosCotacoes.id,
  empresaId: pedidosCotacoes.empresaId,
  pedidoId: pedidosCotacoes.pedidoId,
  status: pedidosCotacoes.status,
  expiraEm: pedidosCotacoes.expiraEm,
  descontoGeralTipo: pedidosCotacoes.descontoGeralTipo,
  descontoGeralValor: pedidosCotacoes.descontoGeralValor,
  observacao: pedidosCotacoes.observacao,
  prazoEntrega: pedidosCotacoes.prazoEntrega,
  condicaoPagamento: pedidosCotacoes.condicaoPagamento,
  criadoEm: pedidosCotacoes.criadoEm,
  respondidaEm: pedidosCotacoes.respondidaEm
};

// O banco garante o dominio de `status` por CHECK; aqui so estreitamos o texto para a uniao.
function comoLinha(linha: Omit<CotacaoLinha, "status"> & { status: string }): CotacaoLinha {
  return { ...linha, status: linha.status as CotacaoLinha["status"] };
}

export async function buscarCotacaoPorHashRepository(
  tokenHash: string,
  db: ExecutorBanco = banco
): Promise<CotacaoLinha | null> {
  const [linha] = await db.select(colunasCotacao).from(pedidosCotacoes).where(eq(pedidosCotacoes.tokenHash, tokenHash));
  return linha ? comoLinha(linha) : null;
}

/** Trava a cotacao pelo hash: rascunho e envio concorrentes do mesmo link entram em fila. */
export async function travarCotacaoPorHashRepository(
  tokenHash: string,
  tx: TransacaoBanco
): Promise<CotacaoLinha | null> {
  const [linha] = await tx
    .select(colunasCotacao)
    .from(pedidosCotacoes)
    .where(eq(pedidosCotacoes.tokenHash, tokenHash))
    .for("update");
  return linha ? comoLinha(linha) : null;
}

/** A cotacao mais recente do pedido, em qualquer situacao — e a que o Comprador precisa ver. */
export async function buscarUltimaCotacaoDoPedidoRepository(
  pedidoId: string,
  db: ExecutorBanco = banco
): Promise<CotacaoLinha | null> {
  const [linha] = await db
    .select(colunasCotacao)
    .from(pedidosCotacoes)
    .where(eq(pedidosCotacoes.pedidoId, pedidoId))
    .orderBy(desc(pedidosCotacoes.criadoEm))
    .limit(1);
  return linha ? comoLinha(linha) : null;
}

export async function revogarCotacaoAbertaRepository(pedidoId: string, tx: ExecutorBanco): Promise<void> {
  await tx
    .update(pedidosCotacoes)
    .set({ status: "revogada", revogadaEm: new Date(), atualizadoEm: new Date() })
    .where(and(eq(pedidosCotacoes.pedidoId, pedidoId), eq(pedidosCotacoes.status, "aberta")));
}

export async function criarCotacaoRepository(
  input: { empresaId: string; pedidoId: string; tokenHash: string; expiraEm: Date; criadoPor: string },
  tx: ExecutorBanco
): Promise<string> {
  const [linha] = await tx.insert(pedidosCotacoes).values(input).returning({ id: pedidosCotacoes.id });
  if (!linha) throw new Error("Cotacao nao criada");
  return linha.id;
}

export type ItemCotacaoGravar = {
  pedidoItemId: string;
  indisponivel: boolean;
  valorUnitario: string | null;
  descontoTipo: TipoDescontoCotacao | null;
  descontoValor: string | null;
  valorUnitarioFinal?: string | null;
  totalFinal?: string | null;
};

/**
 * Substitui as respostas da cotacao. Apagar e reinserir e seguro aqui porque so a propria
 * cotacao aberta e tocada, dentro da transacao que travou a linha dela.
 */
export async function gravarRespostaCotacaoRepository(
  input: {
    cotacaoId: string;
    descontoGeralTipo: TipoDescontoCotacao | null;
    descontoGeralValor: string | null;
    observacao: string | null;
    prazoEntrega: string | null;
    condicaoPagamento: string | null;
    itens: ItemCotacaoGravar[];
    envio?: { totalBruto: string; totalFinal: string; respondidaEm: Date };
  },
  tx: TransacaoBanco
): Promise<void> {
  await tx
    .update(pedidosCotacoes)
    .set({
      descontoGeralTipo: input.descontoGeralTipo,
      descontoGeralValor: input.descontoGeralValor,
      observacao: input.observacao,
      prazoEntrega: input.prazoEntrega,
      condicaoPagamento: input.condicaoPagamento,
      atualizadoEm: new Date(),
      ...(input.envio
        ? {
            status: "respondida",
            totalBruto: input.envio.totalBruto,
            totalFinal: input.envio.totalFinal,
            respondidaEm: input.envio.respondidaEm
          }
        : {})
    })
    .where(eq(pedidosCotacoes.id, input.cotacaoId));
  await tx.delete(pedidosCotacoesItens).where(eq(pedidosCotacoesItens.cotacaoId, input.cotacaoId));
  if (!input.itens.length) return;
  await tx.insert(pedidosCotacoesItens).values(
    input.itens.map((item) => ({
      cotacaoId: input.cotacaoId,
      pedidoItemId: item.pedidoItemId,
      indisponivel: item.indisponivel,
      valorUnitario: item.valorUnitario,
      descontoTipo: item.descontoTipo,
      descontoValor: item.descontoValor,
      valorUnitarioFinal: item.valorUnitarioFinal ?? null,
      totalFinal: item.totalFinal ?? null
    }))
  );
}

export type ItemCotacaoLeitura = {
  pedidoItemId: string;
  produtoId: string | null;
  descricao: string;
  quantidade: string;
  unidade: string | null;
  indisponivel: boolean;
  valorUnitario: string | null;
  descontoTipo: TipoDescontoCotacao | null;
  descontoValor: string | null;
};

/** Itens do pedido com a resposta ja salva desta cotacao (vazia quando ainda nao ha rascunho). */
export async function listarItensDaCotacaoRepository(
  cotacaoId: string,
  pedidoId: string,
  db: ExecutorBanco = banco
): Promise<ItemCotacaoLeitura[]> {
  const itens = await db
    .select({
      pedidoItemId: pedidosItens.id,
      produtoId: pedidosItens.produtoId,
      descricao: pedidosItens.descricaoProduto,
      quantidade: pedidosItens.quantidade,
      unidade: unidadesMedida.sigla
    })
    .from(pedidosItens)
    .leftJoin(produtos, eq(produtos.id, pedidosItens.produtoId))
    .leftJoin(unidadesMedida, eq(unidadesMedida.id, produtos.unidadeIndividualId))
    .where(eq(pedidosItens.pedidoId, pedidoId))
    .orderBy(pedidosItens.descricaoProduto);
  const respostas = await db
    .select({
      pedidoItemId: pedidosCotacoesItens.pedidoItemId,
      indisponivel: pedidosCotacoesItens.indisponivel,
      valorUnitario: pedidosCotacoesItens.valorUnitario,
      descontoTipo: pedidosCotacoesItens.descontoTipo,
      descontoValor: pedidosCotacoesItens.descontoValor
    })
    .from(pedidosCotacoesItens)
    .where(eq(pedidosCotacoesItens.cotacaoId, cotacaoId));
  const respostaPorItem = new Map(respostas.map((resposta) => [resposta.pedidoItemId, resposta]));
  return itens.map((item) => {
    const resposta = respostaPorItem.get(item.pedidoItemId);
    return {
      ...item,
      indisponivel: resposta?.indisponivel ?? false,
      valorUnitario: resposta?.valorUnitario ?? null,
      descontoTipo: resposta?.descontoTipo ?? null,
      descontoValor: resposta?.descontoValor ?? null
    };
  });
}

/**
 * "Ultimo valor" de cada produto: o preco EFETIVO por unidade (com desconto do item e rateio do
 * desconto geral) da cotacao respondida mais recente cujo pedido o Comprador CONFIRMOU.
 *
 * Cotacao respondida e ainda nao confirmada fica de fora de proposito: e proposta, nao preco pago.
 * O pedido atual tambem fica de fora, senao o fornecedor veria a propria resposta como referencia.
 *
 * Com `fornecedorId`, so conta o que foi pago a ESSE fornecedor. A tela publica sempre passa o
 * filtro: sem ele, o fornecedor B leria o preco negociado com o concorrente A.
 */
export async function ultimosValoresConfirmadosRepository(
  empresaId: string,
  produtoIds: string[],
  pedidoAtualId: string,
  fornecedorId: string | null,
  db: ExecutorBanco = banco
): Promise<Map<string, string>> {
  if (!produtoIds.length) return new Map();
  const linhas = await db
    .select({ produtoId: pedidosItens.produtoId, valor: pedidosCotacoesItens.valorUnitarioFinal })
    .from(pedidosCotacoesItens)
    .innerJoin(pedidosCotacoes, eq(pedidosCotacoes.id, pedidosCotacoesItens.cotacaoId))
    .innerJoin(pedidosItens, eq(pedidosItens.id, pedidosCotacoesItens.pedidoItemId))
    .innerJoin(pedidos, eq(pedidos.id, pedidosCotacoes.pedidoId))
    .where(
      and(
        eq(pedidosCotacoes.empresaId, empresaId),
        eq(pedidosCotacoes.status, "respondida"),
        inArray(pedidos.status, ["confirmado", "recebido_parcial", "recebido"]),
        ne(pedidos.id, pedidoAtualId),
        ...(fornecedorId ? [eq(pedidos.fornecedorId, fornecedorId)] : []),
        eq(pedidosCotacoesItens.indisponivel, false),
        inArray(pedidosItens.produtoId, produtoIds)
      )
    )
    .orderBy(desc(pedidosCotacoes.respondidaEm));
  const resultado = new Map<string, string>();
  for (const linha of linhas) {
    if (linha.produtoId && linha.valor && !resultado.has(linha.produtoId)) resultado.set(linha.produtoId, linha.valor);
  }
  return resultado;
}

/** Nomes que a tela publica mostra: empresa que pede e fornecedor que responde. Nada alem disso. */
export async function buscarNomesDaCotacaoRepository(
  pedidoId: string,
  db: ExecutorBanco = banco
): Promise<{ empresaNome: string; fornecedorNome: string | null; fornecedorId: string | null } | null> {
  const [linha] = await db
    .select({ empresaNome: empresas.nome, fornecedorNome: fornecedores.nome, fornecedorId: pedidos.fornecedorId })
    .from(pedidos)
    .innerJoin(empresas, eq(empresas.id, pedidos.empresaId))
    .leftJoin(fornecedores, eq(fornecedores.id, pedidos.fornecedorId))
    .where(eq(pedidos.id, pedidoId));
  return linha ?? null;
}
