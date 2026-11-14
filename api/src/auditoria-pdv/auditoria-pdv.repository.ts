import { and, asc, between, eq, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
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

export async function fusoDaEmpresaRepository(empresaId: string, db: ExecutorBanco = banco) {
  const [linha] = await db
    .select({ fuso: empresas.fusoHorario })
    .from(empresas)
    .where(eq(empresas.id, empresaId))
    .limit(1);
  return linha?.fuso ?? "America/Sao_Paulo";
}

export async function pdvsDaEmpresaRepository(empresaId: string, db: ExecutorBanco = banco) {
  return db
    .select({ id: pdvs.id, nome: pdvs.nome, ativo: pdvs.ativo })
    .from(pdvs)
    .where(eq(pdvs.empresaId, empresaId))
    .orderBy(asc(pdvs.nome));
}

type FiltroPeriodo = { empresaId: string; inicio: string; fim: string; pdvId?: string | undefined };

// Mesmo recorte de vendasDoPeriodoRepository, por join (um periodo longo passaria do limite de parametros).
const vendaDoPeriodo = (f: FiltroPeriodo) =>
  and(
    vendaAuditavel(f.empresaId),
    between(vendas.dataReferencia, f.inicio, f.fim),
    f.pdvId ? eq(vendas.pdvId, f.pdvId) : undefined
  );

export async function vendasDoPeriodoRepository(filtro: FiltroPeriodo, db: ExecutorBanco = banco) {
  return db
    .select({
      id: vendas.id,
      data: sql<string>`${vendas.dataReferencia}::text`,
      pdvId: vendas.pdvId,
      pdvNome: pdvs.nome,
      pdvAutomacao: vendas.pdvAutomacao,
      caixaId: vendas.caixaId,
      dataVenda: vendas.dataVenda,
      valor: sql<string>`${liquido}::text`
    })
    .from(vendas)
    .leftJoin(pdvs, eq(pdvs.id, vendas.pdvId))
    .where(vendaDoPeriodo(filtro))
    .orderBy(asc(vendas.dataVenda));
}

export async function pagamentosDoPeriodoRepository(filtro: FiltroPeriodo, db: ExecutorBanco = banco) {
  return db
    .select({
      vendaId: vendasPagamentos.vendaId,
      categoria: formasPagamento.categoriaFechamentoCaixa,
      formaNome: formasPagamento.nome,
      tipoAutomacao: vendasPagamentos.tipoPagamentoAutomacao,
      valor: sql<string>`${vendasPagamentos.totalPago}::text`
    })
    .from(vendasPagamentos)
    .innerJoin(vendas, eq(vendas.id, vendasPagamentos.vendaId))
    .leftJoin(formasPagamento, eq(formasPagamento.id, vendasPagamentos.formaPagamentoId))
    .where(vendaDoPeriodo(filtro));
}

// Produtos so das vendas sem caixa: e o detalhe que o alerta mostra.
export async function produtosForaDoPeriodoRepository(filtro: FiltroPeriodo, db: ExecutorBanco = banco) {
  return db
    .select({
      vendaId: vendasProdutos.vendaId,
      descricao: vendasProdutos.descricaoProduto,
      quantidade: sql<string>`${vendasProdutos.quantidade}::text`
    })
    .from(vendasProdutos)
    .innerJoin(vendas, eq(vendas.id, vendasProdutos.vendaId))
    .where(and(vendaDoPeriodo(filtro), isNull(vendas.caixaId), eq(vendasProdutos.cancelado, false)));
}

// Caixas do periodo: os abertos nessas datas e os que receberam alguma venda do periodo.
export async function caixasDoPeriodoRepository(
  empresaId: string,
  inicio: string,
  fim: string,
  caixaIds: string[],
  db: ExecutorBanco = banco
) {
  const doPeriodo = between(fechamentosCaixa.dataMovimento, inicio, fim);
  return db
    .select({
      id: fechamentosCaixa.id,
      data: sql<string>`${fechamentosCaixa.dataMovimento}::text`,
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
        caixaIds.length ? or(doPeriodo, inArray(fechamentosCaixa.id, caixaIds)) : doPeriodo
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
