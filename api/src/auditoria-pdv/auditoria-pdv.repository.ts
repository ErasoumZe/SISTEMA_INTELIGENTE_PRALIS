import { and, asc, between, eq, inArray, isNotNull, ne, or, sql } from "drizzle-orm";
import { empresas, formasPagamento, pdvs } from "@padaria/db/schema/cadastro";
import { auditoriasPdv, auditoriasPdvAgenda, fechamentosCaixa } from "@padaria/db/schema/caixa";
import { vendas, vendasPagamentos, vendasProdutos } from "@padaria/db/schema/venda";
import type { JsonValue } from "@padaria/shared/api";
import { banco, type ExecutorBanco } from "../banco/conexao.js";

// Auditoria de PDVs (Marco, 13/11/2026). So vendas da CREARE (integradas) e nao canceladas entram: e o que a
// auditoria cruza com os caixas abertos no sistema.
const vendaAuditavel = (empresaId: string) =>
  and(eq(vendas.empresaId, empresaId), isNotNull(vendas.integracaoChaveId), ne(vendas.status, "cancelado"));

const liquido = sql<string>`(${vendas.valorOriginal} - ${vendas.valorDesconto} + ${vendas.valorAcrescimo})`;

export async function resumoVendasPorDiaRepository(
  empresaId: string,
  inicio: string,
  fim: string,
  db: ExecutorBanco = banco
) {
  return db
    .select({
      data: sql<string>`${vendas.dataReferencia}::text`,
      vendas: sql<number>`count(*)::int`,
      total: sql<string>`coalesce(sum(${liquido}), 0)::text`,
      vendasFora: sql<number>`count(*) filter (where ${vendas.caixaId} is null)::int`,
      valorFora: sql<string>`coalesce(sum(${liquido}) filter (where ${vendas.caixaId} is null), 0)::text`
    })
    .from(vendas)
    .where(and(vendaAuditavel(empresaId), between(vendas.dataReferencia, inicio, fim)))
    .groupBy(vendas.dataReferencia);
}

export async function caixasEmAndamentoPorDiaRepository(
  empresaId: string,
  inicio: string,
  fim: string,
  db: ExecutorBanco = banco
) {
  return db
    .select({ data: sql<string>`${fechamentosCaixa.dataMovimento}::text`, abertos: sql<number>`count(*)::int` })
    .from(fechamentosCaixa)
    .where(
      and(
        eq(fechamentosCaixa.empresaId, empresaId),
        between(fechamentosCaixa.dataMovimento, inicio, fim),
        inArray(fechamentosCaixa.status, ["aberto", "em_fechamento"])
      )
    )
    .groupBy(fechamentosCaixa.dataMovimento);
}

export async function vendasDoDiaRepository(empresaId: string, data: string, db: ExecutorBanco = banco) {
  return db
    .select({
      id: vendas.id,
      pdvId: vendas.pdvId,
      pdvNome: pdvs.nome,
      pdvAutomacao: vendas.pdvAutomacao,
      caixaId: vendas.caixaId,
      dataVenda: vendas.dataVenda,
      valor: sql<string>`${liquido}::text`
    })
    .from(vendas)
    .leftJoin(pdvs, eq(pdvs.id, vendas.pdvId))
    .where(and(vendaAuditavel(empresaId), eq(vendas.dataReferencia, data)))
    .orderBy(asc(vendas.dataVenda));
}

export async function pagamentosDasVendasRepository(vendaIds: string[], db: ExecutorBanco = banco) {
  if (!vendaIds.length) return [];
  return db
    .select({
      vendaId: vendasPagamentos.vendaId,
      categoria: formasPagamento.categoriaFechamentoCaixa,
      formaNome: formasPagamento.nome,
      tipoAutomacao: vendasPagamentos.tipoPagamentoAutomacao,
      valor: sql<string>`${vendasPagamentos.totalPago}::text`
    })
    .from(vendasPagamentos)
    .leftJoin(formasPagamento, eq(formasPagamento.id, vendasPagamentos.formaPagamentoId))
    .where(inArray(vendasPagamentos.vendaId, vendaIds));
}

export async function produtosDasVendasRepository(vendaIds: string[], db: ExecutorBanco = banco) {
  if (!vendaIds.length) return [];
  return db
    .select({
      vendaId: vendasProdutos.vendaId,
      descricao: vendasProdutos.descricaoProduto,
      quantidade: sql<string>`${vendasProdutos.quantidade}::text`
    })
    .from(vendasProdutos)
    .where(and(inArray(vendasProdutos.vendaId, vendaIds), eq(vendasProdutos.cancelado, false)));
}

// Caixas do dia: os abertos naquela data e os que receberam alguma venda do dia.
export async function caixasDoDiaRepository(
  empresaId: string,
  data: string,
  caixaIds: string[],
  db: ExecutorBanco = banco
) {
  return db
    .select({
      id: fechamentosCaixa.id,
      pdvId: fechamentosCaixa.pdvId,
      pdvNome: pdvs.nome,
      turno: fechamentosCaixa.turnoCaixa,
      operador: fechamentosCaixa.caixaResponsavelNomeAbertura,
      abertura: fechamentosCaixa.dataHoraAbertura,
      fechamento: fechamentosCaixa.dataHoraFechamento,
      status: fechamentosCaixa.status
    })
    .from(fechamentosCaixa)
    .leftJoin(pdvs, eq(pdvs.id, fechamentosCaixa.pdvId))
    .where(
      and(
        eq(fechamentosCaixa.empresaId, empresaId),
        caixaIds.length
          ? or(eq(fechamentosCaixa.dataMovimento, data), inArray(fechamentosCaixa.id, caixaIds))
          : eq(fechamentosCaixa.dataMovimento, data)
      )
    )
    .orderBy(asc(fechamentosCaixa.dataHoraAbertura));
}

export async function auditoriasGeradasRepository(
  empresaId: string,
  inicio: string,
  fim: string,
  db: ExecutorBanco = banco
) {
  return db
    .select({
      id: auditoriasPdv.id,
      data: sql<string>`${auditoriasPdv.data}::text`,
      geradaEm: auditoriasPdv.geradaEm,
      geradaPor: auditoriasPdv.geradaPor
    })
    .from(auditoriasPdv)
    .where(and(eq(auditoriasPdv.empresaId, empresaId), between(auditoriasPdv.data, inicio, fim)));
}

export async function gravarAuditoriaRepository(
  dados: {
    empresaId: string;
    data: string;
    geradaPor: string | null;
    vendasFora: number;
    valorFora: string;
    resultado: JsonValue;
  },
  db: ExecutorBanco = banco
) {
  const [linha] = await db
    .insert(auditoriasPdv)
    .values({ ...dados, geradaEm: new Date() })
    .onConflictDoUpdate({
      target: [auditoriasPdv.empresaId, auditoriasPdv.data],
      set: {
        geradaPor: dados.geradaPor,
        geradaEm: new Date(),
        vendasFora: dados.vendasFora,
        valorFora: dados.valorFora,
        resultado: dados.resultado
      }
    })
    .returning({ id: auditoriasPdv.id, geradaEm: auditoriasPdv.geradaEm });
  if (!linha) throw new Error("Auditoria nao gravada");
  return linha;
}

export async function buscarAgendaRepository(empresaId: string, db: ExecutorBanco = banco) {
  const [linha] = await db
    .select({ ativa: auditoriasPdvAgenda.ativa, horario: auditoriasPdvAgenda.horario })
    .from(auditoriasPdvAgenda)
    .where(eq(auditoriasPdvAgenda.empresaId, empresaId))
    .limit(1);
  return linha ?? null;
}

export async function salvarAgendaRepository(
  empresaId: string,
  ativa: boolean,
  horario: string,
  db: ExecutorBanco = banco
) {
  await db
    .insert(auditoriasPdvAgenda)
    .values({ empresaId, ativa, horario, atualizadoEm: new Date() })
    .onConflictDoUpdate({ target: auditoriasPdvAgenda.empresaId, set: { ativa, horario, atualizadoEm: new Date() } });
}

export async function agendasAtivasRepository(db: ExecutorBanco = banco) {
  return db
    .select({
      empresaId: auditoriasPdvAgenda.empresaId,
      horario: auditoriasPdvAgenda.horario,
      fuso: empresas.fusoHorario
    })
    .from(auditoriasPdvAgenda)
    .innerJoin(empresas, eq(empresas.id, auditoriasPdvAgenda.empresaId))
    .where(eq(auditoriasPdvAgenda.ativa, true));
}
