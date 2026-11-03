// MODULO PUBLICO do fornecedor (Fase 2, isolamento comercial — R-221 decisao 8). Disjunto do modulo
// do comprador: nao importa o repository/service do comprador nem le a base de precos ou a tabela de
// vencedores. A regra em scripts/verificar-arquitetura.mjs quebra o build se isto for violado. Tudo
// aqui parte do CONVITE e desce pela fronteira fisica do isolamento (convites_itens); nunca ha
// envelope do comprador nem proposta de concorrente.
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  comprasConvitesItens,
  comprasPropostas,
  comprasPropostasItens,
  comprasRodadas,
  comprasRodadasConvites,
  comprasRodadasItens,
  comprasSolicitacoesItens,
  empresas,
  fornecedores,
  fornecedoresProdutos,
  fornecedoresProdutosEventos,
  gruposMercadorias,
  produtos
} from "@padaria/db/schema";
import type { VersaoDoConvite } from "@padaria/shared/compras";
import { banco, type ExecutorBanco, type TransacaoBanco } from "../banco/conexao.js";

export type ConvitePublicoLinha = {
  conviteId: string;
  rodadaId: string;
  empresaId: string;
  solicitacaoId: string;
  conviteStatus: string;
  rodadaStatus: string;
  expiraEm: Date;
  fornecedorId: string;
  fornecedorNome: string;
  empresaNome: string;
  margemVariacaoPercentual: number | null;
  recebimentoInicio: string | null;
  recebimentoFim: string | null;
};

export async function buscarConvitePorHashRepository(
  tokenHash: string,
  db: ExecutorBanco = banco
): Promise<ConvitePublicoLinha | null> {
  const [linha] = await db
    .select({
      conviteId: comprasRodadasConvites.id,
      rodadaId: comprasRodadasConvites.rodadaId,
      empresaId: comprasRodadasConvites.empresaId,
      solicitacaoId: comprasRodadas.solicitacaoId,
      conviteStatus: comprasRodadasConvites.status,
      rodadaStatus: comprasRodadas.status,
      expiraEm: comprasRodadas.expiraEm,
      fornecedorId: comprasRodadasConvites.fornecedorId,
      fornecedorNome: fornecedores.nome,
      empresaNome: empresas.nome,
      margemVariacaoPercentual: comprasRodadas.margemVariacaoPercentual,
      recebimentoInicio: comprasRodadas.recebimentoInicio,
      recebimentoFim: comprasRodadas.recebimentoFim
    })
    .from(comprasRodadasConvites)
    .innerJoin(comprasRodadas, eq(comprasRodadas.id, comprasRodadasConvites.rodadaId))
    .innerJoin(fornecedores, eq(fornecedores.id, comprasRodadasConvites.fornecedorId))
    .innerJoin(empresas, eq(empresas.id, comprasRodadasConvites.empresaId))
    .where(eq(comprasRodadasConvites.tokenHash, tokenHash))
    .limit(1);
  return linha ?? null;
}

/** Trava o convite pelo hash (FOR UPDATE) dentro da transacao da resposta. */
export async function travarConvitePorHashRepository(
  tokenHash: string,
  tx: TransacaoBanco
): Promise<{ id: string; empresaId: string; status: string } | null> {
  const [convite] = await tx
    .select({
      id: comprasRodadasConvites.id,
      empresaId: comprasRodadasConvites.empresaId,
      status: comprasRodadasConvites.status
    })
    .from(comprasRodadasConvites)
    .where(eq(comprasRodadasConvites.tokenHash, tokenHash))
    .limit(1)
    .for("update");
  return convite ?? null;
}

export type ItemPublicoLinha = {
  conviteItemId: string;
  descricaoProduto: string;
  quantidade: string;
  referencia: string | null;
};

/**
 * Itens do convite: quantidade do envelope, descricao e o valor de REFERENCIA congelado na abertura (doc 57
 * §5: o fornecedor ve o ultimo valor pago ou cotado; quem responder igual ou menor primeiro ganha).
 */
export async function itensDoConviteRepository(
  conviteId: string,
  db: ExecutorBanco = banco
): Promise<ItemPublicoLinha[]> {
  return db
    .select({
      conviteItemId: comprasConvitesItens.id,
      descricaoProduto: comprasSolicitacoesItens.descricaoProduto,
      quantidade: comprasRodadasItens.quantidade,
      referencia: comprasRodadasItens.precoBaseValor
    })
    .from(comprasConvitesItens)
    .innerJoin(comprasRodadasItens, eq(comprasRodadasItens.id, comprasConvitesItens.rodadaItemId))
    .innerJoin(comprasSolicitacoesItens, eq(comprasSolicitacoesItens.id, comprasRodadasItens.solicitacaoItemId))
    .where(eq(comprasConvitesItens.conviteId, conviteId))
    .orderBy(asc(comprasSolicitacoesItens.descricaoProduto));
}

export type UltimaPropostaLinha = {
  versao: number;
  frete: string | null;
  observacao: string | null;
  prazoEntrega: string | null;
  condicaoPagamento: string | null;
  itens: Array<{
    conviteItemId: string;
    indisponivel: boolean;
    motivoIndisponivel: "sem_estoque" | "nao_trabalha" | null;
    valorUnitario: string | null;
    quantidadeDisponivel: string | null;
  }>;
};

/** A ultima proposta DO FORNECEDOR neste convite (ele ve so o que e dele; a contraproposta vem a parte). */
export async function ultimaPropostaDoConviteRepository(
  conviteId: string,
  db: ExecutorBanco = banco
): Promise<UltimaPropostaLinha | null> {
  const [proposta] = await db
    .select({
      id: comprasPropostas.id,
      versao: comprasPropostas.versao,
      frete: comprasPropostas.frete,
      observacao: comprasPropostas.observacao,
      prazoEntrega: comprasPropostas.prazoEntrega,
      condicaoPagamento: comprasPropostas.condicaoPagamento
    })
    .from(comprasPropostas)
    .where(
      and(
        eq(comprasPropostas.conviteId, conviteId),
        eq(comprasPropostas.status, "enviada"),
        eq(comprasPropostas.autorTipo, "fornecedor")
      )
    )
    .orderBy(desc(comprasPropostas.versao))
    .limit(1);
  if (!proposta) return null;
  const itens = await db
    .select({
      conviteItemId: comprasPropostasItens.conviteItemId,
      indisponivel: comprasPropostasItens.indisponivel,
      motivoIndisponivel: comprasPropostasItens.motivoIndisponivel,
      valorUnitario: comprasPropostasItens.valorUnitario,
      quantidadeDisponivel: comprasPropostasItens.quantidadeDisponivel
    })
    .from(comprasPropostasItens)
    .where(eq(comprasPropostasItens.propostaId, proposta.id));
  return {
    versao: proposta.versao,
    frete: proposta.frete,
    observacao: proposta.observacao,
    prazoEntrega: proposta.prazoEntrega,
    condicaoPagamento: proposta.condicaoPagamento,
    itens
  };
}

/** O rascunho vivo do convite (um por convite). Os itens saem pelo mesmo formato da ultima proposta. */
export async function rascunhoDoConviteRepository(conviteId: string, db: ExecutorBanco = banco) {
  const [proposta] = await db
    .select({
      id: comprasPropostas.id,
      frete: comprasPropostas.frete,
      observacao: comprasPropostas.observacao,
      prazoEntrega: comprasPropostas.prazoEntrega,
      condicaoPagamento: comprasPropostas.condicaoPagamento
    })
    .from(comprasPropostas)
    .where(and(eq(comprasPropostas.conviteId, conviteId), eq(comprasPropostas.status, "rascunho")))
    .limit(1);
  if (!proposta) return null;
  const itens = await db
    .select({
      conviteItemId: comprasPropostasItens.conviteItemId,
      indisponivel: comprasPropostasItens.indisponivel,
      motivoIndisponivel: comprasPropostasItens.motivoIndisponivel,
      valorUnitario: comprasPropostasItens.valorUnitario,
      quantidadeDisponivel: comprasPropostasItens.quantidadeDisponivel
    })
    .from(comprasPropostasItens)
    .where(eq(comprasPropostasItens.propostaId, proposta.id));
  return { ...proposta, itens };
}

/** Apaga o rascunho (ao salvar outro ou ao enviar): o livro de versoes so guarda o que foi enviado. */
export async function apagarRascunhoRepository(conviteId: string, tx: TransacaoBanco): Promise<void> {
  await tx
    .delete(comprasPropostas)
    .where(and(eq(comprasPropostas.conviteId, conviteId), eq(comprasPropostas.status, "rascunho")));
}

export async function conviteItemIdsRepository(conviteId: string, tx: TransacaoBanco): Promise<Set<string>> {
  const linhas = await tx
    .select({ id: comprasConvitesItens.id })
    .from(comprasConvitesItens)
    .where(eq(comprasConvitesItens.conviteId, conviteId));
  return new Set(linhas.map((linha) => linha.id));
}

export async function proximaVersaoRepository(conviteId: string, tx: TransacaoBanco): Promise<number> {
  const linhas = await tx
    .select({ versao: comprasPropostas.versao })
    .from(comprasPropostas)
    .where(eq(comprasPropostas.conviteId, conviteId))
    .orderBy(desc(comprasPropostas.versao))
    .limit(1);
  return (linhas[0]?.versao ?? 0) + 1;
}

export async function criarPropostaFornecedorRepository(
  input: {
    /** Doc 58 §4: "rascunho" = salvou sem enviar (Cotado). Padrao: "enviada". */
    status?: "rascunho" | "enviada";
    empresaId: string;
    conviteId: string;
    versao: number;
    frete: number | null;
    observacao: string | null;
    prazoEntrega: string | null;
    condicaoPagamento: string | null;
    itens: Array<{
      conviteItemId: string;
      indisponivel: boolean;
      motivoIndisponivel?: "sem_estoque" | "nao_trabalha" | null;
      valorUnitario: number | null;
      quantidadeDisponivel?: number | null;
    }>;
  },
  tx: TransacaoBanco
): Promise<string> {
  const [proposta] = await tx
    .insert(comprasPropostas)
    .values({
      empresaId: input.empresaId,
      conviteId: input.conviteId,
      versao: input.versao,
      autorTipo: "fornecedor",
      autorUsuarioId: null,
      status: input.status ?? "enviada",
      frete: input.frete === null ? null : String(input.frete),
      observacao: input.observacao,
      prazoEntrega: input.prazoEntrega,
      condicaoPagamento: input.condicaoPagamento,
      enviadaEm: input.status === "rascunho" ? null : new Date()
    })
    .returning({ id: comprasPropostas.id });
  if (!proposta) throw new Error("Proposta nao criada");
  await tx.insert(comprasPropostasItens).values(
    input.itens.map((item) => ({
      empresaId: input.empresaId,
      propostaId: proposta.id,
      conviteItemId: item.conviteItemId,
      indisponivel: item.indisponivel,
      motivoIndisponivel: item.indisponivel ? (item.motivoIndisponivel ?? null) : null,
      // custo_final/frete_rateado ficam null: o rateio e a comparacao com a base sao do comprador (E5).
      valorUnitario: item.valorUnitario === null ? null : String(item.valorUnitario),
      quantidadeDisponivel:
        item.indisponivel || item.quantidadeDisponivel == null ? null : String(item.quantidadeDisponivel)
    }))
  );
  return proposta.id;
}

export async function marcarConviteRespondidoRepository(
  conviteId: string,
  empresaId: string,
  tx: TransacaoBanco
): Promise<void> {
  await tx
    .update(comprasRodadasConvites)
    .set({ respondidoEm: new Date() })
    .where(and(eq(comprasRodadasConvites.id, conviteId), eq(comprasRodadasConvites.empresaId, empresaId)));
}

/**
 * O livro INTEIRO do convite (fornecedor e comprador, so versoes enviadas), da mais antiga para a mais
 * nova. E o que alimenta a contraproposta vigente e o aceite. So o convite do token: nunca outro.
 */
export async function versoesDoConviteRepository(
  conviteId: string,
  db: ExecutorBanco = banco
): Promise<VersaoDoConvite[]> {
  const propostas = await db
    .select({ id: comprasPropostas.id, versao: comprasPropostas.versao, autorTipo: comprasPropostas.autorTipo })
    .from(comprasPropostas)
    .where(and(eq(comprasPropostas.conviteId, conviteId), eq(comprasPropostas.status, "enviada")))
    .orderBy(asc(comprasPropostas.versao));
  const versoes: VersaoDoConvite[] = [];
  for (const proposta of propostas) {
    const itens = await db
      .select({
        conviteItemId: comprasPropostasItens.conviteItemId,
        indisponivel: comprasPropostasItens.indisponivel,
        valorUnitario: comprasPropostasItens.valorUnitario
      })
      .from(comprasPropostasItens)
      .where(eq(comprasPropostasItens.propostaId, proposta.id));
    versoes.push({ versao: proposta.versao, autorTipo: proposta.autorTipo, itens });
  }
  return versoes;
}

// --- doc 57 §5.1: o fornecedor diz o que mais ele vende -------------------------------------------

/**
 * Os produtos ativos e liberados para compra da padaria (so nome e grupo) e se ESTE fornecedor ja esta vinculado a
 * cada um. Doc 59: o fornecedor so ve o que a padaria compra pelo pedido.
 */
export async function produtosParaFornecedorRepository(
  empresaId: string,
  fornecedorId: string,
  db: ExecutorBanco = banco
) {
  return db
    .select({
      produtoId: produtos.id,
      descricao: produtos.descricao,
      grupo: gruposMercadorias.nome,
      vinculo: fornecedoresProdutos.status
    })
    .from(produtos)
    .leftJoin(gruposMercadorias, eq(gruposMercadorias.id, produtos.grupoMercadoriaId))
    .leftJoin(
      fornecedoresProdutos,
      and(eq(fornecedoresProdutos.produtoId, produtos.id), eq(fornecedoresProdutos.fornecedorId, fornecedorId))
    )
    .where(and(eq(produtos.empresaId, empresaId), eq(produtos.status, "ativo"), eq(produtos.liberadoCompra, true)))
    .orderBy(asc(produtos.descricao));
}

/**
 * O fornecedor marca o que vende: o vinculo nasce APROVADO (José, 22/10: a partir da proxima cotacao ele ja
 * recebe aquele produto). Vinculo que ja existe (inclusive rejeitado pelo comprador) nao e tocado.
 */
export async function vincularProdutosDoFornecedorRepository(
  input: { empresaId: string; fornecedorId: string; produtoIds: string[] },
  tx: TransacaoBanco
): Promise<number> {
  const validos = await tx
    .select({ id: produtos.id })
    .from(produtos)
    .where(and(eq(produtos.empresaId, input.empresaId), inArray(produtos.id, input.produtoIds)));
  if (!validos.length) return 0;
  const criados = await tx
    .insert(fornecedoresProdutos)
    .values(
      validos.map((produto) => ({
        empresaId: input.empresaId,
        fornecedorId: input.fornecedorId,
        produtoId: produto.id,
        status: "aprovado" as const,
        origem: "fornecedor" as const,
        aprovadoEm: new Date(),
        observacao: "Marcado pelo fornecedor na página da cotação"
      }))
    )
    .onConflictDoNothing()
    .returning({ id: fornecedoresProdutos.id });
  if (criados.length)
    await tx.insert(fornecedoresProdutosEventos).values(
      criados.map((vinculo) => ({
        empresaId: input.empresaId,
        fornecedorProdutoId: vinculo.id,
        statusAnterior: null,
        statusNovo: "aprovado" as const,
        atorTipo: "fornecedor" as const,
        observacao: "Marcado pelo fornecedor na página da cotação"
      }))
    );
  return criados.length;
}
