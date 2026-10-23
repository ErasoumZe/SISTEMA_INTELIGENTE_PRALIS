import { and, asc, eq, inArray } from "drizzle-orm";
import {
  comprasSolicitacoesItens,
  gruposMercadorias,
  pedidosAgendaOcorrencias,
  pedidosAgendas
} from "@padaria/db/schema";
import { banco, type ExecutorBanco, type TransacaoBanco } from "../banco/conexao.js";

// MODULO DO COMPRADOR — Solicitacao de compra (doc 58 §2): o pedido do dia que espera o responsavel.

/** Datas que chegaram e ainda esperam o envio, por agenda. */
export async function pendentesDasAgendasRepository(agendaIds: string[], db: ExecutorBanco = banco) {
  if (!agendaIds.length) return [];
  return db
    .select({
      ocorrenciaId: pedidosAgendaOcorrencias.id,
      agendaId: pedidosAgendaOcorrencias.agendaId,
      dataAtual: pedidosAgendaOcorrencias.dataAtual
    })
    .from(pedidosAgendaOcorrencias)
    .where(
      and(
        inArray(pedidosAgendaOcorrencias.agendaId, agendaIds),
        eq(pedidosAgendaOcorrencias.situacao, "aguardando_conferencia")
      )
    )
    .orderBy(asc(pedidosAgendaOcorrencias.dataAtual));
}

const colunasOcorrencia = {
  id: pedidosAgendaOcorrencias.id,
  agendaId: pedidosAgendaOcorrencias.agendaId,
  situacao: pedidosAgendaOcorrencias.situacao,
  solicitacaoId: pedidosAgendaOcorrencias.solicitacaoId,
  dataAtual: pedidosAgendaOcorrencias.dataAtual,
  responsavelId: pedidosAgendas.responsavelId,
  grupoNome: gruposMercadorias.nome,
  prazoRespostaHoras: pedidosAgendas.prazoRespostaHoras,
  margemVariacaoPercentual: pedidosAgendas.margemVariacaoPercentual,
  recebimentoInicio: pedidosAgendas.recebimentoInicio,
  recebimentoFim: pedidosAgendas.recebimentoFim
};

export async function buscarOcorrenciaRepository(id: string, empresaId: string, db: ExecutorBanco = banco) {
  const [linha] = await db
    .select(colunasOcorrencia)
    .from(pedidosAgendaOcorrencias)
    .innerJoin(pedidosAgendas, eq(pedidosAgendas.id, pedidosAgendaOcorrencias.agendaId))
    .innerJoin(gruposMercadorias, eq(gruposMercadorias.id, pedidosAgendas.grupoMercadoriaId))
    .where(and(eq(pedidosAgendaOcorrencias.id, id), eq(pedidosAgendaOcorrencias.empresaId, empresaId)))
    .limit(1);
  return linha ?? null;
}

/** A mesma leitura, travando a ocorrencia: dois envios do mesmo pedido nao saem. */
export async function travarOcorrenciaRepository(id: string, empresaId: string, tx: TransacaoBanco) {
  const [linha] = await tx
    .select(colunasOcorrencia)
    .from(pedidosAgendaOcorrencias)
    .innerJoin(pedidosAgendas, eq(pedidosAgendas.id, pedidosAgendaOcorrencias.agendaId))
    .innerJoin(gruposMercadorias, eq(gruposMercadorias.id, pedidosAgendas.grupoMercadoriaId))
    .where(and(eq(pedidosAgendaOcorrencias.id, id), eq(pedidosAgendaOcorrencias.empresaId, empresaId)))
    .for("update", { of: pedidosAgendaOcorrencias })
    .limit(1);
  return linha ?? null;
}

export async function itensDaSolicitacaoRepository(solicitacaoId: string, db: ExecutorBanco = banco) {
  return db
    .select({
      id: comprasSolicitacoesItens.id,
      produtoId: comprasSolicitacoesItens.produtoId,
      quantidade: comprasSolicitacoesItens.quantidade
    })
    .from(comprasSolicitacoesItens)
    .where(eq(comprasSolicitacoesItens.solicitacaoId, solicitacaoId));
}
