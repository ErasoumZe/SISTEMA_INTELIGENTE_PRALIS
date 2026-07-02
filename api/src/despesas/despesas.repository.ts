import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { debitosColaboradores, fechamentosCaixa } from "@padaria/db/schema/caixa";
import { despesas, despesasItens } from "@padaria/db/schema/despesa";
import type { DespesaDetalheDto, DespesaDto, DespesaPayload, DespesasQuery } from "@padaria/shared/despesas";
import { banco, executarComTransacaoOpcional, type ExecutorBanco } from "../banco/conexao.js";
import { filtrosEmpresa, numeroDecimal, valoresBase, valoresBaseEdicao } from "../lancamentos/lancamentos.dominio.js";

export async function listarDespesasRepository(
  query: DespesasQuery,
  empresasPermitidasIds: string[] | null
): Promise<DespesaDto[]> {
  const filtros = filtrosEmpresa(despesas, query, empresasPermitidasIds);
  if (query.somentePendentes) filtros.push(isNull(despesas.dataPagamento));
  if (query.dataInicio) filtros.push(gte(despesas.dataVencimento, query.dataInicio));
  if (query.dataFim) filtros.push(lte(despesas.dataVencimento, query.dataFim));
  if (query.caixaId) filtros.push(eq(despesas.caixaId, query.caixaId));
  if (query.pdvId) {
    const caixas = await banco
      .select({ id: fechamentosCaixa.id })
      .from(fechamentosCaixa)
      .where(eq(fechamentosCaixa.pdvId, query.pdvId));
    const caixaIds = caixas.map((caixa) => caixa.id);
    if (!caixaIds.length) return [];
    filtros.push(inArray(despesas.caixaId, caixaIds));
  }
  return banco
    .select({
      id: despesas.id,
      empresaId: despesas.empresaId,
      dataReferencia: despesas.dataReferencia,
      dataVencimento: despesas.dataVencimento,
      dataPagamento: despesas.dataPagamento,
      descricao: despesas.descricao,
      valorOriginal: despesas.valorOriginal,
      computar: despesas.computar,
      status: despesas.status
    })
    .from(despesas)
    .where(filtros.length ? and(...filtros) : undefined);
}

export async function criarDespesaRepository(
  dados: DespesaPayload,
  computar: boolean,
  criadoPor: string,
  caixaId?: string | null,
  db?: ExecutorBanco
): Promise<{ id: string }> {
  return executarComTransacaoOpcional(db, async (tx) => {
    const [despesa] = await tx
      .insert(despesas)
      .values({
        ...valoresBase(dados, computar, criadoPor, caixaId),
        dataVencimento: dados.dataVencimento,
        fornecedorId: dados.fornecedorId ?? null,
        colaboradorId: dados.colaboradorId ?? null,
        grupoDespesaId: dados.grupoDespesaId ?? null,
        fotoDocumentoUrl: dados.fotoDocumentoUrl ?? null
      })
      .returning({ id: despesas.id });
    if (!despesa) throw new Error("Despesa nao criada");

    for (const item of dados.itensDespesa) {
      await tx.insert(despesasItens).values({
        despesaId: despesa.id,
        grupoDespesaId: item.grupoDespesaId ?? dados.grupoDespesaId ?? null,
        colaboradorId: item.colaboradorId ?? dados.colaboradorId ?? null,
        descricao: item.descricao,
        valor: String(item.valor)
      });
    }

    if (dados.colaboradorId) {
      await tx.insert(debitosColaboradores).values({
        empresaId: dados.empresaId,
        colaboradorId: dados.colaboradorId,
        tipo: "DESPESA",
        despesaId: despesa.id,
        caixaId: caixaId ?? null,
        valor: String(dados.valorOriginal),
        observacao: dados.observacao ?? null,
        criadoPor
      });
    }

    return despesa;
  });
}

export async function buscarDespesaDetalheRepository(
  despesaId: string,
  db: ExecutorBanco = banco
): Promise<DespesaDetalheDto | null> {
  const [despesa] = await db
    .select({
      id: despesas.id,
      empresaId: despesas.empresaId,
      caixaId: despesas.caixaId,
      status: despesas.status,
      dataReferencia: despesas.dataReferencia,
      dataVencimento: despesas.dataVencimento,
      dataPagamento: despesas.dataPagamento,
      descricao: despesas.descricao,
      observacao: despesas.observacao,
      valorOriginal: despesas.valorOriginal,
      valorAcrescimo: despesas.valorAcrescimo,
      descricaoAcrescimo: despesas.descricaoAcrescimo,
      valorDesconto: despesas.valorDesconto,
      descricaoDesconto: despesas.descricaoDesconto,
      contaOrigemId: despesas.contaOrigemId,
      fornecedorId: despesas.fornecedorId,
      colaboradorId: despesas.colaboradorId,
      grupoDespesaId: despesas.grupoDespesaId,
      fotoDocumentoUrl: despesas.fotoDocumentoUrl,
      computar: despesas.computar
    })
    .from(despesas)
    .where(eq(despesas.id, despesaId))
    .limit(1);
  if (!despesa) return null;

  const itens = await db
    .select({
      grupoDespesaId: despesasItens.grupoDespesaId,
      colaboradorId: despesasItens.colaboradorId,
      descricao: despesasItens.descricao,
      valor: despesasItens.valor
    })
    .from(despesasItens)
    .where(eq(despesasItens.despesaId, despesaId));

  return {
    ...despesa,
    valorOriginal: numeroDecimal(despesa.valorOriginal),
    valorAcrescimo: numeroDecimal(despesa.valorAcrescimo),
    valorDesconto: numeroDecimal(despesa.valorDesconto),
    itensDespesa: itens.map((item) => ({ ...item, valor: numeroDecimal(item.valor) }))
  };
}

export async function atualizarDespesaRepository(
  despesaId: string,
  dados: DespesaPayload,
  computar: boolean,
  caixaId: string | null,
  criadoPor: string | null,
  db?: ExecutorBanco
): Promise<void> {
  await executarComTransacaoOpcional(db, async (tx) => {
    await tx
      .update(despesas)
      .set({
        ...valoresBaseEdicao(dados, computar),
        dataVencimento: dados.dataVencimento,
        fornecedorId: dados.fornecedorId ?? null,
        colaboradorId: dados.colaboradorId ?? null,
        grupoDespesaId: dados.grupoDespesaId ?? null,
        fotoDocumentoUrl: dados.fotoDocumentoUrl ?? null
      })
      .where(eq(despesas.id, despesaId));

    await tx.delete(despesasItens).where(eq(despesasItens.despesaId, despesaId));
    for (const item of dados.itensDespesa) {
      await tx.insert(despesasItens).values({
        despesaId,
        grupoDespesaId: item.grupoDespesaId ?? dados.grupoDespesaId ?? null,
        colaboradorId: item.colaboradorId ?? dados.colaboradorId ?? null,
        descricao: item.descricao,
        valor: String(item.valor)
      });
    }

    // O debito de colaborador e derivado do lancamento: substitui conforme o novo payload.
    await tx.delete(debitosColaboradores).where(eq(debitosColaboradores.despesaId, despesaId));
    if (dados.colaboradorId) {
      await tx.insert(debitosColaboradores).values({
        empresaId: dados.empresaId,
        colaboradorId: dados.colaboradorId,
        tipo: "DESPESA",
        despesaId,
        caixaId,
        valor: String(dados.valorOriginal),
        observacao: dados.observacao ?? null,
        criadoPor
      });
    }
  });
}
