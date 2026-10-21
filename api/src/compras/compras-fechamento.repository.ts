// MODULO DO COMPRADOR — fechamento da rodada por prazo (Fase 2, R-221 decisoes 6 e 12). Le e grava
// preco-base e adjudicacao, entao NUNCA e importado pelo modulo publico do fornecedor.
import { and, eq, inArray, isNull, lte, ne } from "drizzle-orm";
import {
  comprasAdjudicacoes,
  comprasRodadas,
  comprasRodadasConvites,
  comprasRodadasItens,
  comprasSolicitacoes,
  comprasSolicitacoesItens,
  pedidos,
  produtos,
  produtosPrecosBase
} from "@padaria/db/schema";
import type { StatusSolicitacao } from "@padaria/shared/compras";
import { banco, type ExecutorBanco, type TransacaoBanco } from "../banco/conexao.js";

export type RodadaVencida = { id: string; empresaId: string; solicitacaoId: string };

/** O roteiro do agendador: so lista; cada rodada revalida tudo sob a propria trava. */
export async function listarRodadasVencidasRepository(
  agora: Date,
  db: ExecutorBanco = banco
): Promise<RodadaVencida[]> {
  return db
    .select({ id: comprasRodadas.id, empresaId: comprasRodadas.empresaId, solicitacaoId: comprasRodadas.solicitacaoId })
    .from(comprasRodadas)
    .where(and(eq(comprasRodadas.status, "aberta"), lte(comprasRodadas.expiraEm, agora)));
}

export type RodadaTravada = {
  id: string;
  empresaId: string;
  solicitacaoId: string;
  status: string;
  expiraEm: Date;
  abertaPor: string;
};

export async function travarRodadaRepository(rodadaId: string, tx: TransacaoBanco): Promise<RodadaTravada | null> {
  const [rodada] = await tx
    .select({
      id: comprasRodadas.id,
      empresaId: comprasRodadas.empresaId,
      solicitacaoId: comprasRodadas.solicitacaoId,
      status: comprasRodadas.status,
      expiraEm: comprasRodadas.expiraEm,
      abertaPor: comprasRodadas.abertaPor
    })
    .from(comprasRodadas)
    .where(eq(comprasRodadas.id, rodadaId))
    .limit(1)
    .for("update");
  return rodada ?? null;
}

export async function totalItensDaRodadaRepository(rodadaId: string, tx: TransacaoBanco): Promise<number> {
  const linhas = await tx
    .select({ id: comprasRodadasItens.id })
    .from(comprasRodadasItens)
    .where(eq(comprasRodadasItens.rodadaId, rodadaId));
  return linhas.length;
}

/** `where status = 'aberta'` e o que faz o fechamento idempotente mesmo se duas instancias correrem. */
export async function fecharRodadaPorPrazoRepository(
  input: { rodadaId: string; fechadaEm: Date },
  tx: TransacaoBanco
): Promise<boolean> {
  const fechadas = await tx
    .update(comprasRodadas)
    .set({ status: "fechada", fechadaEm: input.fechadaEm, motivoFechamento: "prazo", fechadaPor: null })
    .where(and(eq(comprasRodadas.id, input.rodadaId), eq(comprasRodadas.status, "aberta")))
    .returning({ id: comprasRodadas.id });
  return fechadas.length > 0;
}

export async function encerrarConvitesDaRodadaRepository(rodadaId: string, tx: TransacaoBanco): Promise<void> {
  await tx
    .update(comprasRodadasConvites)
    .set({ status: "encerrado" })
    .where(
      and(
        eq(comprasRodadasConvites.rodadaId, rodadaId),
        inArray(comprasRodadasConvites.status, ["aberto", "aguardando_comprador"])
      )
    );
}

/**
 * Status da solicitacao com o `encerrada_em` que a constraint exige: preenchido exatamente nos
 * estados terminais (encerrada, cancelada, comprada).
 */
export async function atualizarStatusSolicitacaoRepository(
  input: { solicitacaoId: string; empresaId: string; status: StatusSolicitacao; agora: Date },
  tx: TransacaoBanco
): Promise<void> {
  const terminal = input.status === "comprada" || input.status === "encerrada" || input.status === "cancelada";
  await tx
    .update(comprasSolicitacoes)
    .set({ status: input.status, encerradaEm: terminal ? input.agora : null })
    .where(and(eq(comprasSolicitacoes.id, input.solicitacaoId), eq(comprasSolicitacoes.empresaId, input.empresaId)));
}

export type CompraAutomaticaDaRodada = {
  produtoId: string;
  produtoAtivo: boolean;
  custoFinalUnitario: string;
};

/**
 * O que a rodada comprou SOZINHA (decisao 12 + recomendacao aprovada por Jose em 21/10/2026): so a
 * compra automatica alimenta a base. Compra aprovada pelo Comprador e excecao acima do envelope
 * por definicao; virar base subiria, em silencio, o teto da pre-autorizacao da rodada seguinte.
 */
export async function comprasAutomaticasDaRodadaRepository(
  rodadaId: string,
  tx: TransacaoBanco
): Promise<CompraAutomaticaDaRodada[]> {
  const linhas = await tx
    .select({
      produtoId: comprasSolicitacoesItens.produtoId,
      produtoStatus: produtos.status,
      custoFinalUnitario: comprasAdjudicacoes.custoFinalUnitario
    })
    .from(comprasAdjudicacoes)
    .innerJoin(comprasRodadasItens, eq(comprasRodadasItens.id, comprasAdjudicacoes.rodadaItemId))
    .innerJoin(comprasSolicitacoesItens, eq(comprasSolicitacoesItens.id, comprasRodadasItens.solicitacaoItemId))
    .innerJoin(produtos, eq(produtos.id, comprasSolicitacoesItens.produtoId))
    .innerJoin(pedidos, eq(pedidos.id, comprasAdjudicacoes.pedidoId))
    .where(
      and(
        eq(comprasRodadasItens.rodadaId, rodadaId),
        eq(comprasAdjudicacoes.modo, "automatica"),
        // Base e o que a padaria PAGOU: compra automatica cancelada antes do vencimento nao conta.
        ne(pedidos.status, "cancelado")
      )
    );
  return linhas.map((linha) => ({
    produtoId: linha.produtoId,
    produtoAtivo: linha.produtoStatus === "ativo",
    custoFinalUnitario: linha.custoFinalUnitario
  }));
}

/**
 * Troca a base vigente do produto: fecha a atual (`valido_ate`) e abre a nova com origem 'rodada'.
 * O historico fica intacto (a tabela e temporal). `momento` nunca e anterior ao inicio da vigente,
 * porque a constraint exige `valido_ate > valido_desde`.
 */
export async function substituirPrecoBaseRepository(
  input: {
    empresaId: string;
    produtoId: string;
    valor: string;
    rodadaId: string;
    criadoPor: string;
    agora: Date;
  },
  tx: TransacaoBanco
): Promise<void> {
  const [vigente] = await tx
    .select({ id: produtosPrecosBase.id, validoDesde: produtosPrecosBase.validoDesde })
    .from(produtosPrecosBase)
    .where(
      and(
        eq(produtosPrecosBase.empresaId, input.empresaId),
        eq(produtosPrecosBase.produtoId, input.produtoId),
        isNull(produtosPrecosBase.validoAte)
      )
    )
    .limit(1)
    .for("update");
  const momento =
    vigente && vigente.validoDesde.getTime() >= input.agora.getTime()
      ? new Date(vigente.validoDesde.getTime() + 1)
      : input.agora;
  if (vigente) {
    await tx.update(produtosPrecosBase).set({ validoAte: momento }).where(eq(produtosPrecosBase.id, vigente.id));
  }
  await tx.insert(produtosPrecosBase).values({
    empresaId: input.empresaId,
    produtoId: input.produtoId,
    valor: input.valor,
    origem: "rodada",
    rodadaId: input.rodadaId,
    validoDesde: momento,
    criadoPor: input.criadoPor
  });
}
