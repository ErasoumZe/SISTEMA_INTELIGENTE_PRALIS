import { and } from "drizzle-orm";
import { debitosColaboradores } from "@padaria/db/schema/caixa";
import { retiradas } from "@padaria/db/schema/retirada";
import type { RetiradaDto, RetiradaPayload, RetiradasQuery } from "@padaria/shared/retiradas";
import { banco } from "../banco/conexao.js";
import { filtrosEmpresa, valoresBase } from "../lancamentos/referencias.js";

export async function listarRetiradasRepository(
  query: RetiradasQuery,
  empresasPermitidasIds: string[] | null
): Promise<RetiradaDto[]> {
  const filtros = filtrosEmpresa(retiradas, query, empresasPermitidasIds);
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
  caixaId?: string | null
): Promise<{ id: string }> {
  return banco.transaction(async (tx) => {
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
