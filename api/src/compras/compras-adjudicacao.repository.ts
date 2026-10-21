// MODULO DO COMPRADOR — compra automatica (Fase 2, decisoes 1/5/12/14). Le preco-base e grava
// adjudicacao + pedido confirmado. NUNCA e importado pelo modulo publico do fornecedor (a regra de
// verificar-arquitetura garante). Disparado pelo controller publico apos a resposta ser gravada.
import { and, eq } from "drizzle-orm";
import {
  comprasAdjudicacoes,
  comprasConvitesItens,
  comprasPropostas,
  comprasPropostasItens,
  comprasRodadas,
  comprasRodadasConvites,
  comprasRodadasItens,
  comprasSolicitacoesItens,
  pedidos,
  pedidosEventos,
  pedidosItens
} from "@padaria/db/schema";
import { type TransacaoBanco } from "../banco/conexao.js";

export type PropostaParaAdjudicacao = {
  propostaId: string;
  versao: number;
  empresaId: string;
  conviteId: string;
  rodadaId: string;
  solicitacaoId: string;
  fornecedorId: string;
  rodadaStatus: string;
  tetoValor: string | null;
  abertaPor: string;
  frete: string | null;
  itens: Array<{
    propostaItemId: string;
    conviteItemId: string;
    rodadaItemId: string;
    indisponivel: boolean;
    valorUnitario: string | null;
    quantidade: string;
    precoBaseValor: string | null;
    produtoId: string;
    descricaoProduto: string;
    estoqueAtual: string | null;
    estoqueMin: string | null;
    estoqueMax: string | null;
  }>;
};

export async function carregarPropostaParaAdjudicacaoRepository(
  propostaId: string,
  tx: TransacaoBanco
): Promise<PropostaParaAdjudicacao | null> {
  const [proposta] = await tx
    .select({
      propostaId: comprasPropostas.id,
      versao: comprasPropostas.versao,
      empresaId: comprasPropostas.empresaId,
      conviteId: comprasPropostas.conviteId,
      frete: comprasPropostas.frete,
      autorTipo: comprasPropostas.autorTipo,
      rodadaId: comprasRodadas.id,
      solicitacaoId: comprasRodadas.solicitacaoId,
      rodadaStatus: comprasRodadas.status,
      tetoValor: comprasRodadas.tetoValor,
      abertaPor: comprasRodadas.abertaPor,
      fornecedorId: comprasRodadasConvites.fornecedorId
    })
    .from(comprasPropostas)
    .innerJoin(comprasRodadasConvites, eq(comprasRodadasConvites.id, comprasPropostas.conviteId))
    .innerJoin(comprasRodadas, eq(comprasRodadas.id, comprasRodadasConvites.rodadaId))
    .where(eq(comprasPropostas.id, propostaId))
    .limit(1);
  if (!proposta || proposta.autorTipo !== "fornecedor") return null;

  const itens = await tx
    .select({
      propostaItemId: comprasPropostasItens.id,
      conviteItemId: comprasPropostasItens.conviteItemId,
      indisponivel: comprasPropostasItens.indisponivel,
      valorUnitario: comprasPropostasItens.valorUnitario,
      rodadaItemId: comprasRodadasItens.id,
      quantidade: comprasRodadasItens.quantidade,
      precoBaseValor: comprasRodadasItens.precoBaseValor,
      produtoId: comprasSolicitacoesItens.produtoId,
      descricaoProduto: comprasSolicitacoesItens.descricaoProduto,
      estoqueAtual: comprasSolicitacoesItens.estoqueAtual,
      estoqueMin: comprasSolicitacoesItens.estoqueMin,
      estoqueMax: comprasSolicitacoesItens.estoqueMax
    })
    .from(comprasPropostasItens)
    .innerJoin(comprasConvitesItens, eq(comprasConvitesItens.id, comprasPropostasItens.conviteItemId))
    .innerJoin(comprasRodadasItens, eq(comprasRodadasItens.id, comprasConvitesItens.rodadaItemId))
    .innerJoin(comprasSolicitacoesItens, eq(comprasSolicitacoesItens.id, comprasRodadasItens.solicitacaoItemId))
    .where(eq(comprasPropostasItens.propostaId, propostaId));

  return {
    propostaId: proposta.propostaId,
    versao: proposta.versao,
    empresaId: proposta.empresaId,
    conviteId: proposta.conviteId,
    rodadaId: proposta.rodadaId,
    solicitacaoId: proposta.solicitacaoId,
    fornecedorId: proposta.fornecedorId,
    rodadaStatus: proposta.rodadaStatus,
    tetoValor: proposta.tetoValor,
    abertaPor: proposta.abertaPor,
    frete: proposta.frete,
    itens
  };
}

/** rodada_items ja com vencedor (nao estao mais livres). */
export async function rodadaItensAdjudicadosRepository(rodadaId: string, tx: TransacaoBanco): Promise<Set<string>> {
  const linhas = await tx
    .select({ rodadaItemId: comprasAdjudicacoes.rodadaItemId })
    .from(comprasAdjudicacoes)
    .innerJoin(comprasRodadasItens, eq(comprasRodadasItens.id, comprasAdjudicacoes.rodadaItemId))
    .where(eq(comprasRodadasItens.rodadaId, rodadaId));
  return new Set(linhas.map((linha) => linha.rodadaItemId));
}

/** Soma ja comprada automaticamente na rodada (para o teto — decisao 14). Soma em JS: SQL cru e
 * proibido em api/src, e o volume por rodada e pequeno. */
export async function somaAutomaticaDaRodadaRepository(rodadaId: string, tx: TransacaoBanco): Promise<number> {
  const linhas = await tx
    .select({
      custoFinalUnitario: comprasAdjudicacoes.custoFinalUnitario,
      quantidade: comprasAdjudicacoes.quantidade
    })
    .from(comprasAdjudicacoes)
    .innerJoin(comprasRodadasItens, eq(comprasRodadasItens.id, comprasAdjudicacoes.rodadaItemId))
    .where(and(eq(comprasRodadasItens.rodadaId, rodadaId), eq(comprasAdjudicacoes.modo, "automatica")));
  return linhas.reduce((soma, linha) => soma + Number(linha.custoFinalUnitario) * Number(linha.quantidade), 0);
}

export async function pedidoConfirmadoDaRodadaRepository(
  rodadaId: string,
  fornecedorId: string,
  tx: TransacaoBanco
): Promise<string | null> {
  const [pedido] = await tx
    .select({ id: pedidos.id })
    .from(pedidos)
    .where(
      and(eq(pedidos.rodadaId, rodadaId), eq(pedidos.fornecedorId, fornecedorId), eq(pedidos.status, "confirmado"))
    )
    .limit(1)
    // Trava o pedido antes de anexar item: se o recebimento mudar o status entre a leitura e a escrita,
    // o Postgres reavalia o filtro apos a espera e o pedido some do resultado (nasce um novo).
    .for("update");
  return pedido?.id ?? null;
}

export async function criarPedidoConfirmadoRepository(
  input: {
    empresaId: string;
    solicitacaoId: string;
    rodadaId: string;
    fornecedorId: string;
    propostaId: string;
    // pedidos.criado_por e NOT NULL. A compra automatica nao tem humano confirmando, mas TEM o
    // comprador que abriu a rodada (quem pre-autorizou pela base). O EVENTO registra a proposta como
    // autor (criadoPor null), provando que nenhum humano confirmou; o pedido guarda o abridor.
    abertaPor: string;
    // Excecao aprovada pelo Comprador (E6): o evento passa a ter o aprovador como autor.
    aprovadoPor?: string | null;
  },
  tx: TransacaoBanco
): Promise<string> {
  const aprovadoPor = input.aprovadoPor ?? null;
  const [pedido] = await tx
    .insert(pedidos)
    .values({
      empresaId: input.empresaId,
      fornecedorId: input.fornecedorId,
      tipo: "rodada",
      status: "confirmado",
      recorrencia: "nenhuma",
      solicitacaoId: input.solicitacaoId,
      rodadaId: input.rodadaId,
      observacao: aprovadoPor
        ? "Compra aprovada pelo comprador (excecao ao preco-base)."
        : "Compra automatica (pre-autorizada pelo preco-base).",
      criadoPor: input.abertaPor
    })
    .returning({ id: pedidos.id });
  if (!pedido) throw new Error("Pedido da rodada nao criado");
  await tx.insert(pedidosEventos).values({
    empresaId: input.empresaId,
    pedidoId: pedido.id,
    status: "confirmado",
    observacao: aprovadoPor ? "Compra aprovada pelo comprador" : "Compra automatica",
    criadoPor: aprovadoPor,
    propostaId: input.propostaId
  });
  return pedido.id;
}

export async function inserirItemPedidoRepository(
  input: {
    pedidoId: string;
    fornecedorId: string;
    produtoId: string;
    descricaoProduto: string;
    quantidade: string;
    estoqueAtual: string | null;
    estoqueMin: string | null;
    estoqueMax: string | null;
  },
  tx: TransacaoBanco
): Promise<string> {
  const [item] = await tx
    .insert(pedidosItens)
    .values({
      pedidoId: input.pedidoId,
      produtoId: input.produtoId,
      fornecedorId: input.fornecedorId,
      descricaoProduto: input.descricaoProduto,
      quantidade: input.quantidade,
      estoqueAtual: input.estoqueAtual,
      estoqueMin: input.estoqueMin,
      estoqueMax: input.estoqueMax
    })
    .returning({ id: pedidosItens.id });
  if (!item) throw new Error("Item do pedido nao criado");
  return item.id;
}

/** Insere a adjudicacao; onConflictDoNothing no UNIQUE(rodada_item_id) e o que torna "resposta tardia
 * nunca substitui compra realizada" (R-218) uma garantia de banco. Devolve true se ESTA transacao
 * venceu o item. */
export async function inserirAdjudicacaoRepository(
  input: {
    empresaId: string;
    rodadaItemId: string;
    propostaItemId: string;
    fornecedorId: string;
    pedidoId: string;
    pedidoItemId: string;
    quantidade: string;
    custoFinalUnitario: number;
    precoBaseValor: string | null;
    // 'automatica' nao tem aprovador; 'comprador' exige (constraint compras_adjudicacoes_aprovador_check).
    modo: "automatica" | "comprador";
    aprovadoPor: string | null;
  },
  tx: TransacaoBanco
): Promise<boolean> {
  const inseridos = await tx
    .insert(comprasAdjudicacoes)
    .values({
      empresaId: input.empresaId,
      rodadaItemId: input.rodadaItemId,
      propostaItemId: input.propostaItemId,
      fornecedorId: input.fornecedorId,
      pedidoId: input.pedidoId,
      pedidoItemId: input.pedidoItemId,
      modo: input.modo,
      quantidade: input.quantidade,
      custoFinalUnitario: String(input.custoFinalUnitario),
      precoBaseValor: input.precoBaseValor,
      aprovadoPor: input.aprovadoPor
    })
    .onConflictDoNothing({ target: comprasAdjudicacoes.rodadaItemId })
    .returning({ id: comprasAdjudicacoes.id });
  return inseridos.length > 0;
}

export async function gravarCustoPropostaItemRepository(
  input: { propostaItemId: string; freteRateado: number; custoFinalUnitario: number },
  tx: TransacaoBanco
): Promise<void> {
  await tx
    .update(comprasPropostasItens)
    .set({ freteRateado: String(input.freteRateado), custoFinalUnitario: String(input.custoFinalUnitario) })
    .where(eq(comprasPropostasItens.id, input.propostaItemId));
}
