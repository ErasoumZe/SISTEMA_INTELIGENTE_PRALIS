import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { formasPagamento } from "@padaria/db/schema/cadastro";
import { vendas, vendasPagamentos } from "@padaria/db/schema/venda";
import { banco } from "../banco/conexao.js";

// Formas que o Admin ainda nao configurou. Enquanto estiverem aqui, toda venda paga por elas nasce
// PENDENTE e nao vira saldo (R-168) — e esta lista e o unico jeito de alguem descobrir isso antes de
// o dinheiro sumir do relatorio.
//
// So devolve nome. Nao ha valor nenhum nesta consulta: quem tem apenas a permissao de roteamento e
// um configurador, nao pode ver faturamento.
export async function formasSemRoteamentoRepository(escopoEmpresas: string[]) {
  if (!escopoEmpresas.length) return [];
  return banco
    .select({ id: formasPagamento.id, empresaId: formasPagamento.empresaId, nome: formasPagamento.nome })
    .from(formasPagamento)
    .where(and(inArray(formasPagamento.empresaId, escopoEmpresas), isNull(formasPagamento.disponibilidade)))
    .orderBy(asc(formasPagamento.nome));
}

// Vendas com pagamento PENDENTE — dinheiro que existe e nao esta em conta nenhuma.
//
// Carrega VALOR, entao a rota so entrega isto a quem tem permissao financeira. O `limite` existe
// porque a tela mostra as mais recentes e o contador vem da consulta agregada, nunca do tamanho
// desta lista: truncar em silencio e como dizer que ha 50 pendencias quando ha 5.000.
export async function vendasComRoteamentoPendenteRepository(escopoEmpresas: string[], limite: number) {
  if (!escopoEmpresas.length) return [];
  return banco
    .select({
      vendaId: vendas.id,
      empresaId: vendas.empresaId,
      identificadorExterno: vendas.identificadorExterno,
      dataReferencia: vendas.dataReferencia,
      dataVenda: vendas.dataVenda,
      pdvAutomacao: vendas.pdvAutomacao,
      formaPagamento: vendasPagamentos.tipoPagamentoAutomacao,
      totalPago: vendasPagamentos.totalPago
    })
    .from(vendasPagamentos)
    .innerJoin(vendas, eq(vendas.id, vendasPagamentos.vendaId))
    .where(
      and(
        inArray(vendas.empresaId, escopoEmpresas),
        eq(vendasPagamentos.roteamentoStatus, "pendente"),
        eq(vendas.computar, true)
      )
    )
    .orderBy(desc(vendas.dataReferencia), desc(vendas.id))
    .limit(limite);
}

// O total REAL, agregado no banco. Separado da lista de propósito: o contador nao pode depender do
// limite da listagem.
export async function totaisRoteamentoPendenteRepository(escopoEmpresas: string[]) {
  if (!escopoEmpresas.length) return { pagamentos: 0, vendas: 0, totalCentavos: 0 };
  const [linha] = await banco
    .select({
      pagamentos: sql<number>`count(*)::int`,
      vendas: sql<number>`count(distinct ${vendas.id})::int`,
      // Em centavos inteiros ja no banco, para nao arrastar float ate a borda.
      totalCentavos: sql<number>`coalesce(sum(round(${vendasPagamentos.totalPago} * 100)), 0)::bigint`
    })
    .from(vendasPagamentos)
    .innerJoin(vendas, eq(vendas.id, vendasPagamentos.vendaId))
    .where(
      and(
        inArray(vendas.empresaId, escopoEmpresas),
        eq(vendasPagamentos.roteamentoStatus, "pendente"),
        eq(vendas.computar, true)
      )
    );
  return {
    pagamentos: Number(linha?.pagamentos ?? 0),
    vendas: Number(linha?.vendas ?? 0),
    totalCentavos: Number(linha?.totalCentavos ?? 0)
  };
}
