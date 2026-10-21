// MODULO DO COMPRADOR — fila de decisao e aprovacao de excecao (Fase 2, R-221 decisoes 1 e 6). Le
// preco-base e todas as propostas, entao NUNCA e importado pelo modulo publico do fornecedor.
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  comprasAdjudicacoes,
  comprasConvitesItens,
  comprasPropostas,
  comprasPropostasItens,
  comprasRodadas,
  comprasRodadasConvites,
  comprasRodadasItens,
  comprasSolicitacoes,
  comprasSolicitacoesItens,
  fornecedores
} from "@padaria/db/schema";
import { banco, type ExecutorBanco, type TransacaoBanco } from "../banco/conexao.js";

export type RodadaDecisaoCabecalho = {
  id: string;
  solicitacaoId: string;
  status: "aberta" | "fechada" | "cancelada";
};

export type ItemDoEnvelope = {
  rodadaItemId: string;
  solicitacaoItemId: string;
  produtoId: string;
  descricaoProduto: string;
  quantidade: string;
  precoBaseValor: string | null;
};

export type PropostaItemDaFila = {
  propostaItemId: string;
  rodadaItemId: string;
  fornecedorId: string;
  fornecedorNome: string;
  versao: number;
  indisponivel: boolean;
  valorUnitario: string | null;
  freteRateado: string | null;
  custoFinalUnitario: string | null;
};

export type DadosDaFila = {
  cabecalho: RodadaDecisaoCabecalho;
  itens: ItemDoEnvelope[];
  adjudicados: Set<string>;
  propostas: PropostaItemDaFila[];
};

/**
 * Tudo que a fila precisa, lido do envelope congelado: itens, o que ja tem vencedor e a ULTIMA
 * proposta enviada de cada convite (versoes antigas nao decidem nada). Contraproposta do comprador
 * (E7) nao entra: so o que o fornecedor ofereceu.
 */
export async function carregarFilaDaRodadaRepository(
  rodadaId: string,
  empresaId: string,
  db: ExecutorBanco = banco
): Promise<DadosDaFila | null> {
  const [cabecalho] = await db
    .select({ id: comprasRodadas.id, solicitacaoId: comprasRodadas.solicitacaoId, status: comprasRodadas.status })
    .from(comprasRodadas)
    .where(and(eq(comprasRodadas.id, rodadaId), eq(comprasRodadas.empresaId, empresaId)))
    .limit(1);
  if (!cabecalho) return null;

  const itens = await db
    .select({
      rodadaItemId: comprasRodadasItens.id,
      solicitacaoItemId: comprasRodadasItens.solicitacaoItemId,
      produtoId: comprasSolicitacoesItens.produtoId,
      descricaoProduto: comprasSolicitacoesItens.descricaoProduto,
      quantidade: comprasRodadasItens.quantidade,
      precoBaseValor: comprasRodadasItens.precoBaseValor
    })
    .from(comprasRodadasItens)
    .innerJoin(comprasSolicitacoesItens, eq(comprasSolicitacoesItens.id, comprasRodadasItens.solicitacaoItemId))
    .where(eq(comprasRodadasItens.rodadaId, rodadaId))
    .orderBy(asc(comprasSolicitacoesItens.descricaoProduto));

  const vencedores = await db
    .select({ rodadaItemId: comprasAdjudicacoes.rodadaItemId })
    .from(comprasAdjudicacoes)
    .innerJoin(comprasRodadasItens, eq(comprasRodadasItens.id, comprasAdjudicacoes.rodadaItemId))
    .where(eq(comprasRodadasItens.rodadaId, rodadaId));

  const enviadas = await db
    .select({
      propostaId: comprasPropostas.id,
      conviteId: comprasPropostas.conviteId,
      versao: comprasPropostas.versao,
      fornecedorId: comprasRodadasConvites.fornecedorId,
      fornecedorNome: fornecedores.nome
    })
    .from(comprasPropostas)
    .innerJoin(comprasRodadasConvites, eq(comprasRodadasConvites.id, comprasPropostas.conviteId))
    .innerJoin(fornecedores, eq(fornecedores.id, comprasRodadasConvites.fornecedorId))
    .where(
      and(
        eq(comprasRodadasConvites.rodadaId, rodadaId),
        eq(comprasPropostas.status, "enviada"),
        eq(comprasPropostas.autorTipo, "fornecedor")
      )
    )
    .orderBy(desc(comprasPropostas.versao));
  const ultimaPorConvite = new Map<string, (typeof enviadas)[number]>();
  for (const proposta of enviadas) {
    if (!ultimaPorConvite.has(proposta.conviteId)) ultimaPorConvite.set(proposta.conviteId, proposta);
  }
  const ultimas = [...ultimaPorConvite.values()];

  const linhas = ultimas.length
    ? await db
        .select({
          propostaItemId: comprasPropostasItens.id,
          propostaId: comprasPropostasItens.propostaId,
          rodadaItemId: comprasConvitesItens.rodadaItemId,
          indisponivel: comprasPropostasItens.indisponivel,
          valorUnitario: comprasPropostasItens.valorUnitario,
          freteRateado: comprasPropostasItens.freteRateado,
          custoFinalUnitario: comprasPropostasItens.custoFinalUnitario
        })
        .from(comprasPropostasItens)
        .innerJoin(comprasConvitesItens, eq(comprasConvitesItens.id, comprasPropostasItens.conviteItemId))
        .where(
          inArray(
            comprasPropostasItens.propostaId,
            ultimas.map((proposta) => proposta.propostaId)
          )
        )
    : [];
  const propostaPorId = new Map(ultimas.map((proposta) => [proposta.propostaId, proposta]));
  const propostas: PropostaItemDaFila[] = linhas.map((linha) => {
    const proposta = propostaPorId.get(linha.propostaId)!;
    return {
      propostaItemId: linha.propostaItemId,
      rodadaItemId: linha.rodadaItemId,
      fornecedorId: proposta.fornecedorId,
      fornecedorNome: proposta.fornecedorNome,
      versao: proposta.versao,
      indisponivel: linha.indisponivel,
      valorUnitario: linha.valorUnitario,
      freteRateado: linha.freteRateado,
      custoFinalUnitario: linha.custoFinalUnitario
    };
  });

  return {
    cabecalho,
    itens,
    adjudicados: new Set(vencedores.map((vencedor) => vencedor.rodadaItemId)),
    propostas
  };
}

export type PropostaItemParaAprovar = {
  propostaItemId: string;
  propostaId: string;
  versao: number;
  conviteId: string;
  fornecedorId: string;
  rodadaId: string;
  solicitacaoId: string;
  rodadaStatus: string;
  abertaPor: string;
  rodadaItemId: string;
  quantidade: string;
  precoBaseValor: string | null;
  produtoId: string;
  descricaoProduto: string;
  estoqueAtual: string | null;
  estoqueMin: string | null;
  estoqueMax: string | null;
  indisponivel: boolean;
  valorUnitario: string | null;
  custoFinalUnitario: string | null;
};

/** O item de proposta que o Comprador escolheu, com tudo que a adjudicacao precisa (so na empresa dele). */
export async function buscarPropostaItemParaAprovarRepository(
  propostaItemId: string,
  empresaId: string,
  db: ExecutorBanco
): Promise<PropostaItemParaAprovar | null> {
  const [linha] = await db
    .select({
      propostaItemId: comprasPropostasItens.id,
      propostaId: comprasPropostas.id,
      versao: comprasPropostas.versao,
      autorTipo: comprasPropostas.autorTipo,
      propostaStatus: comprasPropostas.status,
      conviteId: comprasRodadasConvites.id,
      fornecedorId: comprasRodadasConvites.fornecedorId,
      rodadaId: comprasRodadas.id,
      solicitacaoId: comprasRodadas.solicitacaoId,
      rodadaStatus: comprasRodadas.status,
      abertaPor: comprasRodadas.abertaPor,
      rodadaItemId: comprasRodadasItens.id,
      quantidade: comprasRodadasItens.quantidade,
      precoBaseValor: comprasRodadasItens.precoBaseValor,
      produtoId: comprasSolicitacoesItens.produtoId,
      descricaoProduto: comprasSolicitacoesItens.descricaoProduto,
      estoqueAtual: comprasSolicitacoesItens.estoqueAtual,
      estoqueMin: comprasSolicitacoesItens.estoqueMin,
      estoqueMax: comprasSolicitacoesItens.estoqueMax,
      indisponivel: comprasPropostasItens.indisponivel,
      valorUnitario: comprasPropostasItens.valorUnitario,
      custoFinalUnitario: comprasPropostasItens.custoFinalUnitario
    })
    .from(comprasPropostasItens)
    .innerJoin(comprasPropostas, eq(comprasPropostas.id, comprasPropostasItens.propostaId))
    .innerJoin(comprasRodadasConvites, eq(comprasRodadasConvites.id, comprasPropostas.conviteId))
    .innerJoin(comprasRodadas, eq(comprasRodadas.id, comprasRodadasConvites.rodadaId))
    .innerJoin(comprasConvitesItens, eq(comprasConvitesItens.id, comprasPropostasItens.conviteItemId))
    .innerJoin(comprasRodadasItens, eq(comprasRodadasItens.id, comprasConvitesItens.rodadaItemId))
    .innerJoin(comprasSolicitacoesItens, eq(comprasSolicitacoesItens.id, comprasRodadasItens.solicitacaoItemId))
    .where(and(eq(comprasPropostasItens.id, propostaItemId), eq(comprasRodadas.empresaId, empresaId)))
    .limit(1);
  if (!linha || linha.autorTipo !== "fornecedor" || linha.propostaStatus !== "enviada") return null;
  return linha;
}

/** A versao mais recente ENVIADA do fornecedor naquele convite: so ela pode ser aprovada. */
export async function ultimaVersaoEnviadaDoConviteRepository(conviteId: string, tx: TransacaoBanco): Promise<number> {
  const [linha] = await tx
    .select({ versao: comprasPropostas.versao })
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
  return linha?.versao ?? 0;
}

export type SolicitacaoTravada = { id: string; empresaId: string; status: string };

export async function travarSolicitacaoRepository(
  solicitacaoId: string,
  empresaId: string,
  tx: TransacaoBanco
): Promise<SolicitacaoTravada | null> {
  const [solicitacao] = await tx
    .select({
      id: comprasSolicitacoes.id,
      empresaId: comprasSolicitacoes.empresaId,
      status: comprasSolicitacoes.status
    })
    .from(comprasSolicitacoes)
    .where(and(eq(comprasSolicitacoes.id, solicitacaoId), eq(comprasSolicitacoes.empresaId, empresaId)))
    .limit(1)
    .for("update");
  return solicitacao ?? null;
}

/** A solicitacao existe NESTA empresa? Lida antes da advisory: quem manda um id alheio nao segura trava nenhuma. */
export async function solicitacaoExisteNaEmpresaRepository(
  solicitacaoId: string,
  empresaId: string,
  db: ExecutorBanco = banco
): Promise<boolean> {
  const [linha] = await db
    .select({ id: comprasSolicitacoes.id })
    .from(comprasSolicitacoes)
    .where(and(eq(comprasSolicitacoes.id, solicitacaoId), eq(comprasSolicitacoes.empresaId, empresaId)))
    .limit(1);
  return Boolean(linha);
}

/** Solicitacao dona da rodada, lida antes da trava so para saber qual advisory pegar. */
export async function solicitacaoDaRodadaRepository(
  rodadaId: string,
  empresaId: string,
  db: ExecutorBanco = banco
): Promise<string | null> {
  const [rodada] = await db
    .select({ solicitacaoId: comprasRodadas.solicitacaoId })
    .from(comprasRodadas)
    .where(and(eq(comprasRodadas.id, rodadaId), eq(comprasRodadas.empresaId, empresaId)))
    .limit(1);
  return rodada?.solicitacaoId ?? null;
}
