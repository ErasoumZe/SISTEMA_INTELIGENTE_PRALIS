// MODULO PUBLICO do fornecedor (Fase 2, isolamento comercial — R-221 decisao 8). Disjunto do modulo
// do comprador: nao importa o repository/service do comprador nem le a base de precos ou a tabela de
// vencedores. A regra em scripts/verificar-arquitetura.mjs quebra o build se isto for violado. Tudo
// aqui parte do CONVITE e desce pela fronteira fisica do isolamento (convites_itens); nunca ha
// envelope do comprador nem proposta de concorrente.
import { and, asc, desc, eq } from "drizzle-orm";
import {
  comprasConvitesItens,
  comprasPropostas,
  comprasPropostasItens,
  comprasRodadas,
  comprasRodadasConvites,
  comprasRodadasItens,
  comprasSolicitacoesItens,
  empresas,
  fornecedores
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
      empresaNome: empresas.nome
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

export type ItemPublicoLinha = { conviteItemId: string; descricaoProduto: string; quantidade: string };

/** Itens do convite (quantidade do envelope + descricao). NUNCA o preco-base. */
export async function itensDoConviteRepository(
  conviteId: string,
  db: ExecutorBanco = banco
): Promise<ItemPublicoLinha[]> {
  return db
    .select({
      conviteItemId: comprasConvitesItens.id,
      descricaoProduto: comprasSolicitacoesItens.descricaoProduto,
      quantidade: comprasRodadasItens.quantidade
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
  itens: Array<{ conviteItemId: string; indisponivel: boolean; valorUnitario: string | null }>;
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
      valorUnitario: comprasPropostasItens.valorUnitario
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
    empresaId: string;
    conviteId: string;
    versao: number;
    frete: number | null;
    observacao: string | null;
    prazoEntrega: string | null;
    condicaoPagamento: string | null;
    itens: Array<{ conviteItemId: string; indisponivel: boolean; valorUnitario: number | null }>;
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
      status: "enviada",
      frete: input.frete === null ? null : String(input.frete),
      observacao: input.observacao,
      prazoEntrega: input.prazoEntrega,
      condicaoPagamento: input.condicaoPagamento,
      enviadaEm: new Date()
    })
    .returning({ id: comprasPropostas.id });
  if (!proposta) throw new Error("Proposta nao criada");
  await tx.insert(comprasPropostasItens).values(
    input.itens.map((item) => ({
      empresaId: input.empresaId,
      propostaId: proposta.id,
      conviteItemId: item.conviteItemId,
      indisponivel: item.indisponivel,
      // custo_final/frete_rateado ficam null: o rateio e a comparacao com a base sao do comprador (E5).
      valorUnitario: item.valorUnitario === null ? null : String(item.valorUnitario)
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
