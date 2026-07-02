import { and, eq } from "drizzle-orm";
import { debitosColaboradores } from "@padaria/db/schema/caixa";
import { retiradas } from "@padaria/db/schema/retirada";
import type { RetiradaDetalheDto, RetiradaDto, RetiradaPayload, RetiradasQuery } from "@padaria/shared/retiradas";
import { banco, executarComTransacaoOpcional, type ExecutorBanco } from "../banco/conexao.js";
import { filtrosEmpresa, numeroDecimal, valoresBase, valoresBaseEdicao } from "../lancamentos/lancamentos.dominio.js";

export async function listarRetiradasRepository(
  query: RetiradasQuery,
  empresasPermitidasIds: string[] | null
): Promise<RetiradaDto[]> {
  const filtros = filtrosEmpresa(retiradas, query, empresasPermitidasIds);
  if (query.caixaId) filtros.push(eq(retiradas.caixaId, query.caixaId));
  return banco
    .select({
      id: retiradas.id,
      empresaId: retiradas.empresaId,
      dataReferencia: retiradas.dataReferencia,
      descricao: retiradas.descricao,
      valorOriginal: retiradas.valorOriginal,
      computar: retiradas.computar,
      status: retiradas.status
    })
    .from(retiradas)
    .where(filtros.length ? and(...filtros) : undefined);
}

export async function criarRetiradaRepository(
  dados: RetiradaPayload,
  computar: boolean,
  criadoPor: string,
  caixaId?: string | null,
  db?: ExecutorBanco
): Promise<{ id: string }> {
  return executarComTransacaoOpcional(db, async (tx) => {
    const [retirada] = await tx
      .insert(retiradas)
      .values({
        ...valoresBase(dados, computar, criadoPor, caixaId),
        dataVencimento: dados.dataVencimento,
        grupoRetiradaId: dados.grupoRetiradaId ?? null,
        colaboradorId: dados.colaboradorId
      })
      .returning({ id: retiradas.id });
    if (!retirada) throw new Error("Retirada nao criada");

    await tx.insert(debitosColaboradores).values({
      empresaId: dados.empresaId,
      colaboradorId: dados.colaboradorId,
      tipo: "RETIRADA",
      retiradaId: retirada.id,
      caixaId: caixaId ?? null,
      valor: String(dados.valorOriginal),
      observacao: dados.observacao ?? null,
      criadoPor
    });

    return retirada;
  });
}

export async function buscarRetiradaDetalheRepository(
  retiradaId: string,
  db: ExecutorBanco = banco
): Promise<RetiradaDetalheDto | null> {
  const [retirada] = await db
    .select({
      id: retiradas.id,
      empresaId: retiradas.empresaId,
      caixaId: retiradas.caixaId,
      status: retiradas.status,
      dataReferencia: retiradas.dataReferencia,
      dataVencimento: retiradas.dataVencimento,
      dataPagamento: retiradas.dataPagamento,
      descricao: retiradas.descricao,
      observacao: retiradas.observacao,
      valorOriginal: retiradas.valorOriginal,
      valorAcrescimo: retiradas.valorAcrescimo,
      descricaoAcrescimo: retiradas.descricaoAcrescimo,
      valorDesconto: retiradas.valorDesconto,
      descricaoDesconto: retiradas.descricaoDesconto,
      contaOrigemId: retiradas.contaOrigemId,
      colaboradorId: retiradas.colaboradorId,
      grupoRetiradaId: retiradas.grupoRetiradaId,
      computar: retiradas.computar
    })
    .from(retiradas)
    .where(eq(retiradas.id, retiradaId))
    .limit(1);
  if (!retirada) return null;

  return {
    ...retirada,
    valorOriginal: numeroDecimal(retirada.valorOriginal),
    valorAcrescimo: numeroDecimal(retirada.valorAcrescimo),
    valorDesconto: numeroDecimal(retirada.valorDesconto)
  };
}

export async function atualizarRetiradaRepository(
  retiradaId: string,
  dados: RetiradaPayload,
  computar: boolean,
  caixaId: string | null,
  criadoPor: string | null,
  db?: ExecutorBanco
): Promise<void> {
  await executarComTransacaoOpcional(db, async (tx) => {
    await tx
      .update(retiradas)
      .set({
        ...valoresBaseEdicao(dados, computar),
        dataVencimento: dados.dataVencimento,
        grupoRetiradaId: dados.grupoRetiradaId ?? null,
        colaboradorId: dados.colaboradorId
      })
      .where(eq(retiradas.id, retiradaId));

    // O debito de colaborador e derivado do lancamento: substitui conforme o novo payload.
    await tx.delete(debitosColaboradores).where(eq(debitosColaboradores.retiradaId, retiradaId));
    await tx.insert(debitosColaboradores).values({
      empresaId: dados.empresaId,
      colaboradorId: dados.colaboradorId,
      tipo: "RETIRADA",
      retiradaId,
      caixaId,
      valor: String(dados.valorOriginal),
      observacao: dados.observacao ?? null,
      criadoPor
    });
  });
}
