import { and, count, eq, inArray, isNotNull, isNull, lt, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { contas, contasUsuarios, empresas, pdvs } from "@padaria/db/schema/cadastro";
import {
  lacres,
  transferencias,
  transferenciasConferenciasRecusadas,
  transferenciasDestinosCandidatos
} from "@padaria/db/schema/transferencia";
import {
  calcularPrazoConfirmacao,
  type ConfirmarTransferenciaPayload,
  type TempoConfirmacao,
  type TransferenciaDetalheDto,
  type TransferenciaDto,
  type TransferenciaPayload,
  type TransferenciasQuery
} from "@padaria/shared/transferencias";
import { centavosParaDecimalBanco, paraCentavos } from "@padaria/shared/dinheiro";
import { banco, type ExecutorBanco, type TransacaoBanco } from "../banco/conexao.js";
import { ehEntregaCaixaParaCofre } from "./entrega-cofre.repository.js";
import { filtrosEmpresa, numeroDecimal, valoresBase, valoresBaseEdicao } from "../lancamentos/lancamentos.dominio.js";
import { textoDoMovimento } from "../lancamentos/texto-movimento.js";

export async function listarTransferenciasRepository(
  query: TransferenciasQuery,
  empresasPermitidasIds: string[] | null
): Promise<TransferenciaDto[]> {
  const filtros = filtrosEmpresa(transferencias, query, empresasPermitidasIds);
  if (query.caixaId) filtros.push(eq(transferencias.caixaId, query.caixaId));
  if (query.status) filtros.push(eq(transferencias.status, query.status));
  const origem = alias(contas, "conta_origem");
  const destino = alias(contas, "conta_destino");
  const linhas = await banco
    .select({
      id: transferencias.id,
      empresaId: transferencias.empresaId,
      dataReferencia: transferencias.dataReferencia,
      descricao: textoDoMovimento(transferencias),
      valorOriginal: transferencias.valorOriginal,
      valorRecebido: transferencias.valorRecebido,
      computar: transferencias.computar,
      status: transferencias.status,
      contaOrigemId: transferencias.contaOrigemId,
      contaDestinoId: transferencias.contaDestinoId,
      contaOrigemNome: origem.nome,
      contaDestinoNome: destino.nome,
      nLacreDoc: transferencias.nLacreDoc,
      prazoConfirmacaoEm: transferencias.prazoConfirmacaoEm,
      dataRecebimento: transferencias.dataRecebimento,
      confirmadoPor: transferencias.confirmadoPor,
      // Os tres ingredientes do predicado canonico. Vem crus para a borda decidir uma vez so,
      // com a MESMA regra de `buscarContextoConferenciaRepository` — ver `ehCaixaParaCofre`.
      caixaId: transferencias.caixaId,
      tipo: transferencias.tipo,
      contaCofreId: empresas.contaCofreId
    })
    .from(transferencias)
    .innerJoin(origem, eq(origem.id, transferencias.contaOrigemId))
    .innerJoin(destino, eq(destino.id, transferencias.contaDestinoId))
    .innerJoin(empresas, eq(empresas.id, transferencias.empresaId))
    .where(filtros.length ? and(...filtros) : undefined);
  return linhas.map(({ caixaId, tipo, contaCofreId, ...linha }) => ({
    ...linha,
    status: linha.status as TransferenciaDto["status"],
    valorRecebido: linha.valorRecebido === null ? null : numeroDecimal(linha.valorRecebido),
    prazoConfirmacaoEm: linha.prazoConfirmacaoEm?.toISOString() ?? null,
    dataRecebimento: linha.dataRecebimento?.toISOString() ?? null,
    ehCaixaParaCofre: ehEntregaCaixaParaCofre({
      caixaId,
      tipo,
      contaDestinoId: linha.contaDestinoId,
      contaCofreId
    })
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
      origem: "retorno"
    });
  }
  return transferencia;
}

// R-185: as filhas nascem no MESMO commit da transferencia inicial. `agendada` nao entra no
// saldo; o Caixa sera ligado ao plano somente quando o lacre da ida abrir o turno.
export async function criarRetornosPlanejadosRepository(
  input: {
    empresaId: string;
    transferenciaOrigemId: string;
    dataReferencia: string;
    contaOrigemId: string;
    planos: { valor: number; nLacreDoc: string; contaDestinoId: string }[];
    tempoConfirmacao: TempoConfirmacao;
    computar: boolean;
    criadoPor: string;
    observacao: string | null;
  },
  db: ExecutorBanco = banco
): Promise<void> {
  if (!input.planos.length) return;
  const agora = new Date();
  const criadas = await db
    .insert(transferencias)
    .values(
      input.planos.map((plano) => ({
        empresaId: input.empresaId,
        planejamentoOrigemTransferenciaId: input.transferenciaOrigemId,
        dataReferencia: input.dataReferencia,
        descricao: "Retorno/Sangria planejada",
        observacao: input.observacao,
        valorOriginal: centavosParaDecimalBanco(paraCentavos(plano.valor)),
        valorAcrescimo: centavosParaDecimalBanco(0),
        valorDesconto: centavosParaDecimalBanco(0),
        contaOrigemId: input.contaOrigemId,
        contaDestinoId: plano.contaDestinoId,
        nLacreDoc: plano.nLacreDoc,
        tempoConfirmacao: input.tempoConfirmacao,
        status: "agendada",
        tipo: "sangria",
        computar: input.computar,
        solicitacaoCofreEm: agora,
        criadoPor: input.criadoPor
      }))
    )
    .returning({ id: transferencias.id });
  await db.insert(transferenciasDestinosCandidatos).values(
    criadas.map((transferencia, indice) => ({
      empresaId: input.empresaId,
      transferenciaId: transferencia.id,
      contaId: input.planos[indice]!.contaDestinoId
    }))
  );
  await db.insert(lacres).values(
    criadas.map((transferencia, indice) => ({
      empresaId: input.empresaId,
      numero: input.planos[indice]!.nLacreDoc,
      transferenciaId: transferencia.id,
      origem: "saida"
    }))
  );
}
// P0 (CX-M06 estendida): a linha da transferencia sob `FOR NO KEY UPDATE` durante a edicao — ela
// nao tinha trava nenhuma e o PUT reescreve valor, computar e as DUAS contas (o sinal do total).
// Espelho de `travarDespesaRepository`: escopo de empresa no where e `TransacaoBanco` obrigatorio.
// Ordem unica do P0: o chamador ja segurou o caixa (FOR SHARE) ANTES desta trava.
export async function contaEhPdvDaEmpresaRepository(
  empresaId: string,
  contaId: string,
  db: ExecutorBanco = banco
): Promise<boolean> {
  const [pdv] = await db
    .select({ id: pdvs.id })
    .from(pdvs)
    .where(and(eq(pdvs.empresaId, empresaId), eq(pdvs.contaId, contaId), eq(pdvs.ativo, true)))
    .limit(1);
  return Boolean(pdv);
}

export async function travarTransferenciaRepository(transferenciaId: string, empresaId: string, db: TransacaoBanco) {
  const [linha] = await db
    .select({ id: transferencias.id })
    .from(transferencias)
    .where(and(eq(transferencias.id, transferenciaId), eq(transferencias.empresaId, empresaId)))
    .for("no key update");
  return linha ?? null;
}

// Pai e filhas planejadas sao imutaveis no editor generico: mudar valor, contas ou lacres depois
// de reservar o retorno quebraria o vinculo auditavel e o fechamento do Caixa.
export async function transferenciaTemPlanejamentoRepository(
  transferenciaId: string,
  db: ExecutorBanco = banco
): Promise<boolean> {
  const [linha] = await db
    .select({ id: transferencias.id })
    .from(transferencias)
    .where(
      and(
        isNotNull(transferencias.planejamentoOrigemTransferenciaId),
        or(
          eq(transferencias.id, transferenciaId),
          eq(transferencias.planejamentoOrigemTransferenciaId, transferenciaId)
        )
      )
    )
    .limit(1);
  return Boolean(linha);
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
      descricao: textoDoMovimento(transferencias),
      observacao: transferencias.observacao,
      valorOriginal: transferencias.valorOriginal,
      valorAcrescimo: transferencias.valorAcrescimo,
      descricaoAcrescimo: transferencias.descricaoAcrescimo,
      valorDesconto: transferencias.valorDesconto,
      descricaoDesconto: transferencias.descricaoDesconto,
      contaOrigemId: transferencias.contaOrigemId,
      contaDestinoId: transferencias.contaDestinoId,
      nLacreDoc: transferencias.nLacreDoc,
      valorRecebido: transferencias.valorRecebido,
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
    // R-183: null em tudo que nao e `divergente` — o CHECK do banco garante.
    valorRecebido: transferencia.valorRecebido === null ? null : numeroDecimal(transferencia.valorRecebido),
    contasDestinoIds: candidatos.map((item) => item.contaId),
    retornosPlanejados: [],
    tempoConfirmacao: (transferencia.tempoConfirmacao ?? "1dia") as TempoConfirmacao,
    agendadaPara: transferencia.agendadaPara?.toISOString() ?? null,
    prazoConfirmacaoEm: transferencia.prazoConfirmacaoEm?.toISOString() ?? null,
    dataRecebimento: transferencia.dataRecebimento?.toISOString() ?? null
  };
}

// --- Conferencia Caixa -> Cofre -------------------------------------------------------------
// O contexto que decide se esta transferencia esta sob as regras ESTRITAS do Caixa -> Cofre
// (valor obrigatorio, divergencia vira recusa auditavel) ou sob o comportamento generico vigente.
//
// Os tres criterios sao os que o Jose fixou: ligada ao caixa, tipo de entrega, e destino igual a
// conta de cofre configurada NA EMPRESA. Nenhum deles sozinho basta.
export type ContextoConferencia = {
  id: string;
  empresaId: string;
  status: string;
  valorCentavos: number;
  lacre: string | null;
  criadoPor: string | null;
  // Quem entregou fisicamente (solicitacao D4 executada). Null em avulsa e retorno final — nesses
  // casos o operador e o `criadoPor`.
  executadoPor: string | null;
  // P1/#101: a conferencia REESCREVE `conta_destino_id` com a candidata vencedora, entao ela e o
  // terceiro escritor do destino — e tambem consegue fabricar um movimento Caixa -> Cofre. Os dois
  // campos ja vinham no SELECT; ficam expostos para a guarda do servico decidir sem segunda ida ao
  // banco.
  caixaId: string | null;
  contaCofreId: string | null;
  ehCaixaParaCofre: boolean;
};

export async function buscarContextoConferenciaRepository(
  transferenciaId: string,
  db: ExecutorBanco = banco
): Promise<ContextoConferencia | null> {
  const [linha] = await db
    .select({
      id: transferencias.id,
      empresaId: transferencias.empresaId,
      status: transferencias.status,
      valorOriginal: transferencias.valorOriginal,
      lacre: transferencias.nLacreDoc,
      criadoPor: transferencias.criadoPor,
      executadoPor: transferencias.executadoPor,
      caixaId: transferencias.caixaId,
      tipo: transferencias.tipo,
      contaDestinoId: transferencias.contaDestinoId,
      contaCofreId: empresas.contaCofreId
    })
    .from(transferencias)
    .innerJoin(empresas, eq(empresas.id, transferencias.empresaId))
    .where(eq(transferencias.id, transferenciaId))
    .limit(1);
  if (!linha) return null;

  const ehCaixaParaCofre = ehEntregaCaixaParaCofre(linha);

  return {
    id: linha.id,
    empresaId: linha.empresaId,
    status: linha.status,
    valorCentavos: paraCentavos(linha.valorOriginal),
    lacre: linha.lacre,
    criadoPor: linha.criadoPor,
    executadoPor: linha.executadoPor,
    caixaId: linha.caixaId,
    contaCofreId: linha.contaCofreId,
    ehCaixaParaCofre
  };
}

// Grava UMA tentativa de conferencia recusada e devolve o total acumulado.
//
// Nao toca na transferencia: ela continua `pendente`, exatamente como estava. Quem chama NAO pode
// lancar excecao depois disto — a excecao derrubaria a transacao e apagaria o registro que acabou
// de ser criado, que e justamente a trilha que precisa sobreviver.
export async function registrarRecusaConferenciaRepository(
  input: {
    transferenciaId: string;
    recusadoPor: string;
    motivo: string;
    lacreInformado: string | null;
    valorInformadoCentavos: number | null;
  },
  db: ExecutorBanco = banco
): Promise<{ id: string; tentativas: number }> {
  const [recusa] = await db
    .insert(transferenciasConferenciasRecusadas)
    .values({
      transferenciaId: input.transferenciaId,
      recusadoPor: input.recusadoPor,
      motivo: input.motivo,
      lacreInformado: input.lacreInformado,
      valorInformado:
        input.valorInformadoCentavos === null ? null : centavosParaDecimalBanco(input.valorInformadoCentavos)
    })
    .returning({ id: transferenciasConferenciasRecusadas.id });
  if (!recusa) throw new Error("Recusa de conferencia nao registrada");

  const [total] = await db
    .select({ total: count() })
    .from(transferenciasConferenciasRecusadas)
    .where(eq(transferenciasConferenciasRecusadas.transferenciaId, input.transferenciaId));
  return { id: recusa.id, tentativas: Number(total?.total ?? 1) };
}

// R-183 · o DESFECHO da divergencia: `pendente -> divergente`, com o valor que o cofre contou.
//
// A amarra que faz o trabalho e `status = 'pendente'`: ela torna o ato irrepetivel — quem perder a
// corrida acerta zero linhas e recebe erro de dominio, nunca um segundo encerramento. O `caixa_id`
// vem junto como redundancia barata, e nao como protecao: o chamador o le da MESMA linha que o
// UPDATE vai acertar, entao ele nunca pode falhar sozinho. Fica escrito assim para ninguem confiar
// nele como escopo — o escopo real de "so este caixa" e do chamador.
//
// O selo e rompido aqui, como no `/confirmar`: entrega conferida com lacre intacto para sempre
// mentiria no relatorio de lacres.
export async function encerrarDivergenciaRepository(
  input: {
    transferenciaId: string;
    caixaId: string;
    valorRecebidoCentavos: number;
    lacreDoMovimento: string | null;
  },
  db: ExecutorBanco = banco
): Promise<{ id: string; empresaId: string } | null> {
  const [vencedora] = await db
    .update(transferencias)
    .set({
      status: "divergente",
      valorRecebido: centavosParaDecimalBanco(input.valorRecebidoCentavos),
      atualizadoEm: new Date()
    })
    .where(
      and(
        eq(transferencias.id, input.transferenciaId),
        eq(transferencias.caixaId, input.caixaId),
        eq(transferencias.status, "pendente")
      )
    )
    .returning({ id: transferencias.id, empresaId: transferencias.empresaId });
  if (!vencedora) return null;

  if (!input.lacreDoMovimento) return vencedora;
  const [lacre] = await db
    .update(lacres)
    .set({ rompido: true })
    .where(
      and(
        eq(lacres.transferenciaId, input.transferenciaId),
        eq(lacres.numero, input.lacreDoMovimento),
        eq(lacres.rompido, false)
      )
    )
    .returning({ id: lacres.id });
  if (!lacre) throw new Error("Lacre invalido, ja rompido ou pertencente a outra transferencia");
  return vencedora;
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

// Quem pode conferir ESTA transferencia por ESTA conta: precisa operar uma conta candidata ao
// destino e nao pode ser quem criou o movimento (R-028 — quem envia nao confirma o proprio envio).
//
// Extraida para ser a fonte unica de `confirmar` e `recusar-conferencia`: duas copias da mesma
// pergunta divergiriam, e a recusa passaria a aceitar quem a confirmacao recusa.
async function candidatoConfirmacao(
  transferenciaId: string,
  contaDestinoId: string,
  usuarioId: string,
  db: ExecutorBanco
) {
  const [permitida] = await db
    .select({
      id: transferencias.id,
      criadoPor: transferencias.criadoPor,
      // R-028 aplicada ao fluxo D4: numa solicitacao, `criado_por` e quem PROGRAMOU (retaguarda) e
      // `executado_por` e quem ENTREGOU o malote. Excluir so o primeiro deixava o entregador
      // conferir a propria entrega — e, com o encerramento da R-183, escolher o numero da quebra.
      executadoPor: transferencias.executadoPor,
      nLacreDoc: transferencias.nLacreDoc
    })
    .from(transferenciasDestinosCandidatos)
    .innerJoin(transferencias, eq(transferencias.id, transferenciasDestinosCandidatos.transferenciaId))
    .innerJoin(
      contasUsuarios,
      and(eq(contasUsuarios.contaId, transferenciasDestinosCandidatos.contaId), eq(contasUsuarios.usuarioId, usuarioId))
    )
    .where(
      and(
        eq(transferenciasDestinosCandidatos.transferenciaId, transferenciaId),
        eq(transferenciasDestinosCandidatos.contaId, contaDestinoId)
      )
    )
    .limit(1);
  if (!permitida || permitida.criadoPor === usuarioId || permitida.executadoPor === usuarioId) return null;
  return permitida;
}

export async function ehConfirmadorElegivelRepository(
  input: { transferenciaId: string; contaId: string; usuarioId: string },
  db: ExecutorBanco = banco
): Promise<boolean> {
  return Boolean(await candidatoConfirmacao(input.transferenciaId, input.contaId, input.usuarioId, db));
}

export async function confirmarTransferenciaRepository(
  transferenciaId: string,
  dados: ConfirmarTransferenciaPayload,
  usuarioId: string,
  db: ExecutorBanco = banco
) {
  const permitida = await candidatoConfirmacao(transferenciaId, dados.contaDestinoId, usuarioId, db);
  if (!permitida) return null;

  // Decisao 9 · o lacre so e exigido quando o MOVIMENTO tem um. A checagem vem antes do UPDATE de
  // proposito: divergencia de lacre nao pode confirmar e depois reclamar — o `throw` derruba a
  // transacao e a transferencia continua `pendente`, que e o estado correto para reconferencia.
  const lacreDoMovimento = permitida.nLacreDoc?.trim() || null;
  const lacreInformado = dados.nLacreDoc?.trim() || null;
  if (lacreDoMovimento && lacreInformado !== lacreDoMovimento) {
    throw new Error("Lacre divergente do movimento: confira o envelope antes de confirmar");
  }
  // Movimento sem lacre nao aceita lacre inventado na conferencia — nao ha envelope a que ele
  // corresponda, e aceitar criaria um numero sem rastro.
  if (!lacreDoMovimento && lacreInformado) {
    throw new Error("Movimento sem lacre: nao informe numero de lacre na conferencia");
  }

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

  // Decisao 9: so ha selo a romper quando o movimento tem lacre. Sem lacre, a conferencia termina
  // aqui — antes isto era um `UPDATE` incondicional que nunca casava, e nenhum movimento sem lacre
  // conseguia ser confirmado.
  if (!lacreDoMovimento) return vencedora;

  const [lacre] = await db
    .update(lacres)
    .set({ rompido: true })
    .where(
      and(eq(lacres.transferenciaId, transferenciaId), eq(lacres.numero, lacreDoMovimento), eq(lacres.rompido, false))
    )
    .returning({ id: lacres.id });
  if (!lacre) throw new Error("Lacre invalido, ja rompido ou pertencente a outra transferencia");
  return vencedora;
}

// S1 (R-164): `agendada -> pendente` MUDA a saida do caixa (`pendente` conta; `agendada` nao),
// entao o cron deixou de efetivar em massa e passou a decidir POR LINHA, sob a porta do caixa.
// A lista sai em ordem deterministica (caixa_id, id): quem trava varios caixas na mesma transacao
// adquire os FOR SHARE sempre na mesma ordem, e o fechamento so trava UM caixa — sem ciclo.
const PRAZOS_CONFIRMACAO: TempoConfirmacao[] = ["5min", "10min", "30min", "1h", "1dia", "10dias", "30dias"];

export async function listarAgendadasVencidasRepository(agora = new Date(), db: ExecutorBanco = banco) {
  return db
    .select({
      id: transferencias.id,
      caixaId: transferencias.caixaId,
      tempoConfirmacao: transferencias.tempoConfirmacao,
      // R-165: efetivar `agendada -> pendente` e o instante em que o dinheiro passa a SAIR da
      // origem (`transferenciaContaComoSaida` conta `pendente`, nunca `agendada`). O cron precisa
      // destes campos para conferir o saldo antes de efetivar.
      empresaId: transferencias.empresaId,
      contaOrigemId: transferencias.contaOrigemId,
      valorOriginal: transferencias.valorOriginal,
      computar: transferencias.computar
    })
    .from(transferencias)
    .where(
      and(
        eq(transferencias.status, "agendada"),
        inArray(transferencias.tempoConfirmacao, PRAZOS_CONFIRMACAO),
        lt(transferencias.agendadaPara, agora)
      )
    )
    .orderBy(transferencias.caixaId, transferencias.id);
}

export async function efetivarTransferenciaAgendadaRepository(
  transferenciaId: string,
  prazo: TempoConfirmacao,
  agora: Date,
  db: TransacaoBanco
) {
  const [linha] = await db
    .update(transferencias)
    .set({
      status: "pendente",
      prazoConfirmacaoEm: calcularPrazoConfirmacao(agora, prazo),
      atualizadoEm: agora
    })
    .where(and(eq(transferencias.id, transferenciaId), eq(transferencias.status, "agendada")))
    .returning({ id: transferencias.id });
  return linha ?? null;
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
