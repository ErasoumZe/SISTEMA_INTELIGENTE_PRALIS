import { and } from "drizzle-orm";
import { debitosColaboradores } from "@padaria/db/schema/caixa";
import { despesas, despesasItens } from "@padaria/db/schema/despesa";
import type { DespesaDto, DespesaPayload, DespesasQuery } from "@padaria/shared/despesas";
import { banco } from "../banco/conexao.js";
import { filtrosEmpresa, valoresBase } from "../lancamentos/referencias.js";

export async function listarDespesasRepository(
  query: DespesasQuery,
  empresasPermitidasIds: string[] | null
): Promise<DespesaDto[]> {
  const filtros = filtrosEmpresa(despesas, query, empresasPermitidasIds);
  return banco
    .select({
      id: despesas.id,
      empresaId: despesas.empresaId,
      dataReferencia: despesas.dataReferencia,
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
  caixaId?: string | null
): Promise<{ id: string }> {
  return banco.transaction(async (tx) => {
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
