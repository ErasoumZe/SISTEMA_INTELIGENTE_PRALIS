import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { debitosColaboradores, fechamentosCaixa } from "@padaria/db/schema/caixa";
import { despesas, despesasItens } from "@padaria/db/schema/despesa";
import type { DespesaDto, DespesaPayload, DespesasQuery } from "@padaria/shared/despesas";
import { banco, executarComTransacaoOpcional, type ExecutorBanco } from "../banco/conexao.js";
import { filtrosEmpresa, valoresBase } from "../lancamentos/lancamentos.dominio.js";

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
