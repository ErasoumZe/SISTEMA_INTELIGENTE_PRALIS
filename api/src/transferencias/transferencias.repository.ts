import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { contas, contasUsuarios } from "@padaria/db/schema/cadastro";
import { lacres, transferencias, transferenciasDestinosCandidatos } from "@padaria/db/schema/transferencia";
import {
  calcularPrazoConfirmacao,
  type ConfirmarTransferenciaPayload,
  type TempoConfirmacao,
  type TransferenciaDetalheDto,
  type TransferenciaDto,
  type TransferenciaPayload,
  type TransferenciasQuery
} from "@padaria/shared/transferencias";
import { banco, type ExecutorBanco } from "../banco/conexao.js";
import { filtrosEmpresa, numeroDecimal, valoresBase, valoresBaseEdicao } from "../lancamentos/lancamentos.dominio.js";

export async function listarTransferenciasRepository(
  query: TransferenciasQuery,
  empresasPermitidasIds: string[] | null
): Promise<TransferenciaDto[]> {
  const filtros = filtrosEmpresa(transferencias, query, empresasPermitidasIds);
  if (query.caixaId) filtros.push(eq(transferencias.caixaId, query.caixaId));
  const origem = alias(contas, "conta_origem");
  const destino = alias(contas, "conta_destino");
  const linhas = await banco
    .select({
      id: transferencias.id,
      empresaId: transferencias.empresaId,
      dataReferencia: transferencias.dataReferencia,
      descricao: transferencias.descricao,
      valorOriginal: transferencias.valorOriginal,
      computar: transferencias.computar,
      status: transferencias.status,
      contaOrigemId: transferencias.contaOrigemId,
      contaDestinoId: transferencias.contaDestinoId,
      contaOrigemNome: origem.nome,
      contaDestinoNome: destino.nome,
      nLacreDoc: transferencias.nLacreDoc,
      prazoConfirmacaoEm: transferencias.prazoConfirmacaoEm,
      dataRecebimento: transferencias.dataRecebimento,
      confirmadoPor: transferencias.confirmadoPor
    })
    .from(transferencias)
    .innerJoin(origem, eq(origem.id, transferencias.contaOrigemId))
    .innerJoin(destino, eq(destino.id, transferencias.contaDestinoId))
    .where(filtros.length ? and(...filtros) : undefined);
  return linhas.map((linha) => ({
    ...linha,
    status: linha.status as TransferenciaDto["status"],
    prazoConfirmacaoEm: linha.prazoConfirmacaoEm?.toISOString() ?? null,
    dataRecebimento: linha.dataRecebimento?.toISOString() ?? null
  }));
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
      nLacreDoc: dados.nLacreDoc ?? null,
      agendadaPara: dados.agendadaPara ? new Date(dados.agendadaPara) : null,
      tempoConfirmacao: dados.tempoConfirmacao,
      prazoConfirmacaoEm: dados.agendadaPara ? null : calcularPrazoConfirmacao(new Date(), dados.tempoConfirmacao),
      status: dados.agendadaPara ? "agendada" : "pendente"
    })
    .returning({ id: transferencias.id });
  if (!transferencia) throw new Error("Transferencia nao criada");
  const destinos = [...new Set([dados.contaDestinoId, ...dados.contasDestinoIds])];
  await db
    .insert(transferenciasDestinosCandidatos)
    .values(destinos.map((contaId) => ({ empresaId: dados.empresaId, transferenciaId: transferencia.id, contaId })));
  if (dados.nLacreDoc) {
    await db.insert(lacres).values({
      empresaId: dados.empresaId,
      numero: dados.nLacreDoc,
      transferenciaId: transferencia.id,
      origem: "saida"
    });
  }
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
      nLacreDoc: transferencias.nLacreDoc,
      agendadaPara: transferencias.agendadaPara,
      tempoConfirmacao: transferencias.tempoConfirmacao,
      prazoConfirmacaoEm: transferencias.prazoConfirmacaoEm,
      dataRecebimento: transferencias.dataRecebimento,
      confirmadoPor: transferencias.confirmadoPor,
      computar: transferencias.computar
    })
    .from(transferencias)
    .where(eq(transferencias.id, transferenciaId))
    .limit(1);
  if (!transferencia) return null;

  const candidatos = await db
    .select({ contaId: transferenciasDestinosCandidatos.contaId })
    .from(transferenciasDestinosCandidatos)
    .where(eq(transferenciasDestinosCandidatos.transferenciaId, transferenciaId));
  return {
    ...transferencia,
    valorOriginal: numeroDecimal(transferencia.valorOriginal),
    valorAcrescimo: numeroDecimal(transferencia.valorAcrescimo),
    valorDesconto: numeroDecimal(transferencia.valorDesconto),
    contasDestinoIds: candidatos.map((item) => item.contaId),
    tempoConfirmacao: (transferencia.tempoConfirmacao ?? "1dia") as TempoConfirmacao,
    agendadaPara: transferencia.agendadaPara?.toISOString() ?? null,
    prazoConfirmacaoEm: transferencia.prazoConfirmacaoEm?.toISOString() ?? null,
    dataRecebimento: transferencia.dataRecebimento?.toISOString() ?? null
  };
}

export async function contasPertencemEmpresaRepository(
  contaIds: string[],
  empresaId: string,
  db: ExecutorBanco = banco
) {
  const unicos = [...new Set(contaIds)];
  if (!unicos.length) return false;
  const linhas = await db
    .select({ id: contas.id })
    .from(contas)
    .where(and(inArray(contas.id, unicos), eq(contas.empresaId, empresaId)));
  return linhas.length === unicos.length;
}

export async function confirmarTransferenciaRepository(
  transferenciaId: string,
  dados: ConfirmarTransferenciaPayload,
  usuarioId: string,
  db: ExecutorBanco = banco
) {
  const [permitida] = await db
    .select({ id: transferencias.id, criadoPor: transferencias.criadoPor })
    .from(transferenciasDestinosCandidatos)
    .innerJoin(transferencias, eq(transferencias.id, transferenciasDestinosCandidatos.transferenciaId))
    .innerJoin(
      contasUsuarios,
      and(eq(contasUsuarios.contaId, transferenciasDestinosCandidatos.contaId), eq(contasUsuarios.usuarioId, usuarioId))
    )
    .where(
      and(
        eq(transferenciasDestinosCandidatos.transferenciaId, transferenciaId),
        eq(transferenciasDestinosCandidatos.contaId, dados.contaDestinoId)
      )
    )
    .limit(1);
  if (!permitida || permitida.criadoPor === usuarioId) return null;

  const [vencedora] = await db
    .update(transferencias)
    .set({
      contaDestinoId: dados.contaDestinoId,
      status: "recebido",
      confirmadoPor: usuarioId,
      dataRecebimento: new Date(),
      atualizadoEm: new Date()
    })
    .where(and(eq(transferencias.id, transferenciaId), eq(transferencias.status, "pendente")))
    .returning({ id: transferencias.id, empresaId: transferencias.empresaId, valor: transferencias.valorOriginal });
  if (!vencedora) return null;

  const [lacre] = await db
    .update(lacres)
    .set({ rompido: true })
    .where(
      and(eq(lacres.transferenciaId, transferenciaId), eq(lacres.numero, dados.nLacreDoc), eq(lacres.rompido, false))
    )
    .returning({ id: lacres.id });
  if (!lacre) throw new Error("Lacre invalido, ja rompido ou pertencente a outra transferencia");
  return vencedora;
}

export async function efetivarTransferenciasAgendadasRepository(agora = new Date(), db: ExecutorBanco = banco) {
  return db
    .update(transferencias)
    .set({
      status: "pendente",
      prazoConfirmacaoEm: sql`now() + case ${transferencias.tempoConfirmacao}
        when '5min' then interval '5 minutes' when '10min' then interval '10 minutes'
        when '30min' then interval '30 minutes' when '1h' then interval '1 hour'
        when '10dias' then interval '10 days' when '30dias' then interval '30 days'
        else interval '1 day' end`,
      atualizadoEm: agora
    })
    .where(and(eq(transferencias.status, "agendada"), lt(transferencias.agendadaPara, agora)))
    .returning({ id: transferencias.id });
}

export async function listarTransferenciasVencidasRepository(agora = new Date(), db: ExecutorBanco = banco) {
  return db
    .select({
      id: transferencias.id,
      empresaId: transferencias.empresaId,
      criadoPor: transferencias.criadoPor,
      valor: transferencias.valorOriginal
    })
    .from(transferencias)
    .where(
      and(
        eq(transferencias.status, "pendente"),
        lt(transferencias.prazoConfirmacaoEm, agora),
        isNull(transferencias.travaLiberadaEm)
      )
    );
}

export async function listarDestinatariosTransferenciaRepository(transferenciaId: string, db: ExecutorBanco = banco) {
  return db
    .selectDistinct({ usuarioId: contasUsuarios.usuarioId })
    .from(transferenciasDestinosCandidatos)
    .innerJoin(contasUsuarios, eq(contasUsuarios.contaId, transferenciasDestinosCandidatos.contaId))
    .where(eq(transferenciasDestinosCandidatos.transferenciaId, transferenciaId));
}

export async function usuarioEstaTravadoRepository(usuarioId: string, db: ExecutorBanco = banco) {
  const [linha] = await db
    .select({ id: transferencias.id })
    .from(transferencias)
    .leftJoin(transferenciasDestinosCandidatos, eq(transferenciasDestinosCandidatos.transferenciaId, transferencias.id))
    .leftJoin(contasUsuarios, eq(contasUsuarios.contaId, transferenciasDestinosCandidatos.contaId))
    .where(
      and(
        eq(transferencias.status, "pendente"),
        lt(transferencias.prazoConfirmacaoEm, new Date()),
        isNull(transferencias.travaLiberadaEm),
        or(eq(transferencias.criadoPor, usuarioId), eq(contasUsuarios.usuarioId, usuarioId))
      )
    )
    .limit(1);
  return Boolean(linha);
}

export async function liberarTravaTransferenciaRepository(
  transferenciaId: string,
  usuarioId: string,
  db: ExecutorBanco = banco
) {
  const [linha] = await db
    .update(transferencias)
    .set({ travaLiberadaPor: usuarioId, travaLiberadaEm: new Date(), atualizadoEm: new Date() })
    .where(
      and(
        eq(transferencias.id, transferenciaId),
        eq(transferencias.status, "pendente"),
        isNull(transferencias.travaLiberadaEm)
      )
    )
    .returning({ id: transferencias.id });
  return linha ?? null;
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
      contaDestinoId: dados.contaDestinoId,
      nLacreDoc: dados.nLacreDoc ?? null
    })
    .where(eq(transferencias.id, transferenciaId));
}
