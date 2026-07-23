import { and, eq } from "drizzle-orm";
import { transferencias } from "@padaria/db/schema/transferencia";
import type {
  TransferenciaDetalheDto,
  TransferenciaDto,
  TransferenciaPayload,
  TransferenciasQuery
} from "@padaria/shared/transferencias";
import { banco, type ExecutorBanco } from "../banco/conexao.js";
import { filtrosEmpresa, numeroDecimal, valoresBase, valoresBaseEdicao } from "../lancamentos/lancamentos.dominio.js";

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
      maloteId: dados.maloteId ?? null
    })
    .returning({ id: transferencias.id });
  if (!transferencia) throw new Error("Transferencia nao criada");
  return transferencia;
}

export async function buscarTransferenciaDetalheRepository(
  transferenciaId: string,
  db: ExecutorBanco = banco
): Promise<TransferenciaDetalheDto | null> {
  const [transferencia] = await db
    .select({
      id: transferencias.id,
      empresaId: transferencias.empresaId,
      caixaId: transferencias.caixaId,
      status: transferencias.status,
      dataReferencia: transferencias.dataReferencia,
      descricao: transferencias.descricao,
      observacao: transferencias.observacao,
      valorOriginal: transferencias.valorOriginal,
      valorAcrescimo: transferencias.valorAcrescimo,
      descricaoAcrescimo: transferencias.descricaoAcrescimo,
      valorDesconto: transferencias.valorDesconto,
      descricaoDesconto: transferencias.descricaoDesconto,
      contaOrigemId: transferencias.contaOrigemId,
      contaDestinoId: transferencias.contaDestinoId,
      maloteId: transferencias.maloteId,
      computar: transferencias.computar
    })
    .from(transferencias)
    .where(eq(transferencias.id, transferenciaId))
    .limit(1);
  if (!transferencia) return null;

  return {
    ...transferencia,
    valorOriginal: numeroDecimal(transferencia.valorOriginal),
    valorAcrescimo: numeroDecimal(transferencia.valorAcrescimo),
    valorDesconto: numeroDecimal(transferencia.valorDesconto)
  };
}

export async function atualizarTransferenciaRepository(
  transferenciaId: string,
  dados: TransferenciaPayload,
  computar: boolean,
  db: ExecutorBanco = banco
): Promise<void> {
  await db
    .update(transferencias)
    .set({
      ...valoresBaseEdicao(dados, computar),
      contaOrigemId: dados.contaOrigemId,
      contaDestinoId: dados.contaDestinoId
    })
    .where(eq(transferencias.id, transferenciaId));
}
