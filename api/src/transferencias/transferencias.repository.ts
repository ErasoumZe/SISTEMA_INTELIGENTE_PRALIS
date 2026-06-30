import { and, eq } from "drizzle-orm";
import { transferencias } from "@padaria/db/schema/transferencia";
import type { TransferenciaDto, TransferenciaPayload, TransferenciasQuery } from "@padaria/shared/transferencias";
import { banco, type ExecutorBanco } from "../banco/conexao.js";
import { filtrosEmpresa, valoresBase } from "../lancamentos/lancamentos.dominio.js";

export async function listarTransferenciasRepository(
  query: TransferenciasQuery,
  empresasPermitidasIds: string[] | null
): Promise<TransferenciaDto[]> {
  const filtros = filtrosEmpresa(transferencias, query, empresasPermitidasIds);
  if (query.caixaId) filtros.push(eq(transferencias.caixaId, query.caixaId));
  return banco
    .select({
      id: transferencias.id,
      empresaId: transferencias.empresaId,
      dataReferencia: transferencias.dataReferencia,
      descricao: transferencias.descricao,
      valorOriginal: transferencias.valorOriginal,
      computar: transferencias.computar,
      status: transferencias.status
    })
    .from(transferencias)
    .where(filtros.length ? and(...filtros) : undefined);
}

export async function criarTransferenciaRepository(
  dados: TransferenciaPayload,
  computar: boolean,
  criadoPor: string,
  caixaId?: string | null,
  db: ExecutorBanco = banco
): Promise<{ id: string }> {
  const [transferencia] = await db
    .insert(transferencias)
    .values({
      ...valoresBase(dados, computar, criadoPor, caixaId),
      contaOrigemId: dados.contaOrigemId,
      contaDestinoId: dados.contaDestinoId,
      maloteId: dados.maloteId ?? null,
      lacreMaloteId: dados.lacreMaloteId ?? null
    })
    .returning({ id: transferencias.id });
  if (!transferencia) throw new Error("Transferencia nao criada");
  return transferencia;
}
