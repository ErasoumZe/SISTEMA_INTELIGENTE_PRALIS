import { and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, lt, lte, ne, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { contas, contasUsuarios, empresas, pdvs, perfisUsuarios } from "@padaria/db/schema/cadastro";
import { fechamentosCaixa } from "@padaria/db/schema/caixa";
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
import { ehRetornoDoCaixa } from "./entrega-cofre.repository.js";
import { filtrosEmpresa, numeroDecimal, valoresBase, valoresBaseEdicao } from "../lancamentos/lancamentos.dominio.js";
import { textoDoMovimento } from "../lancamentos/texto-movimento.js";

export async function listarTransferenciasRepository(
  query: TransferenciasQuery,
  empresasPermitidasIds: string[] | null
): Promise<TransferenciaDto[]> {
  const origem = alias(contas, "conta_origem");
  const destino = alias(contas, "conta_destino");
  const criador = alias(perfisUsuarios, "perfil_criador_transferencia");
  const filtros = filtrosEmpresa(transferencias, query, empresasPermitidasIds);
  if (query.caixaId) filtros.push(eq(transferencias.caixaId, query.caixaId));
  if (query.status) filtros.push(eq(transferencias.status, query.status));
  if (query.dataInicio) filtros.push(gte(transferencias.dataReferencia, query.dataInicio));
  if (query.dataFim) filtros.push(lte(transferencias.dataReferencia, query.dataFim));
  if (query.pdvId) filtros.push(eq(fechamentosCaixa.pdvId, query.pdvId));
  if (query.usuario) filtros.push(ilike(criador.nome, `%${query.usuario}%`));
  if (query.contaOrigemId) filtros.push(eq(transferencias.contaOrigemId, query.contaOrigemId));
  if (query.contaDestinoId) filtros.push(eq(transferencias.contaDestinoId, query.contaDestinoId));
  if (query.lacre) filtros.push(ilike(transferencias.nLacreDoc, `%${query.lacre}%`));
  const linhas = await banco
    .select({
      id: transferencias.id,
      empresaId: transferencias.empresaId,
      dataReferencia: transferencias.dataReferencia,
      descricao: textoDoMovimento(transferencias),
      valorOriginal: transferencias.valorOriginal,
      valorRecebido: transferencias.valorRecebido,
      valorEspecieDeclarado: transferencias.valorEspecieDeclarado,
      valorMoedasDeclarado: transferencias.valorMoedasDeclarado,
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
      criadoPor: transferencias.criadoPor,
      criadoPorNome: criador.nome,
      criadoEm: transferencias.criadoEm,
      observacao: transferencias.observacao,
      // Os ingredientes do predicado canonico. Vem crus para a borda decidir uma vez so,
      // com a MESMA regra de `buscarContextoConferenciaRepository` — ver `ehCaixaParaCofre`.
      caixaId: transferencias.caixaId,
      pdvId: fechamentosCaixa.pdvId,
      pdvNome: pdvs.nome,
      planejamentoOrigemTransferenciaId: transferencias.planejamentoOrigemTransferenciaId,
      tipo: transferencias.tipo
    })
    .from(transferencias)
    .innerJoin(origem, eq(origem.id, transferencias.contaOrigemId))
    .innerJoin(destino, eq(destino.id, transferencias.contaDestinoId))
    .innerJoin(empresas, eq(empresas.id, transferencias.empresaId))
    .leftJoin(fechamentosCaixa, eq(fechamentosCaixa.id, transferencias.caixaId))
    .leftJoin(pdvs, eq(pdvs.id, fechamentosCaixa.pdvId))
    .leftJoin(criador, eq(criador.usuarioId, transferencias.criadoPor))
    .where(filtros.length ? and(...filtros) : undefined)
    // O `desc nulls last` escrito a mao era a UNICA violacao de SQL cru (tagged template) em api/src
    // (scripts/verificar-arquitetura.mjs) e derrubava `npm run check` no 3o dos 9 passos, escondendo
    // os seis seguintes. O predicado `is null` como primeira chave reproduz o mesmo plano sem SQL
    // cru: em Postgres `false < true`, entao a linha JA recebida (is null = false) vem primeiro e a
    // pendente fica no fim — que e exatamente o que `nulls last` fazia. A ordenacao continua no
    // banco, e nao virou sort em memoria.
    .orderBy(
      asc(isNull(transferencias.dataRecebimento)),
      desc(transferencias.dataRecebimento),
      desc(transferencias.criadoEm)
    );
  const paisComPlanejamento = linhas.length
    ? await banco
        .select({ id: transferencias.planejamentoOrigemTransferenciaId })
        .from(transferencias)
        .where(
          inArray(
            transferencias.planejamentoOrigemTransferenciaId,
            linhas.map((linha) => linha.id)
          )
        )
    : [];
  const idsPaisComPlanejamento = new Set(paisComPlanejamento.map((linha) => linha.id).filter(Boolean));
  return linhas.map(({ tipo, planejamentoOrigemTransferenciaId, ...linha }) => ({
    ...linha,
    status: linha.status as TransferenciaDto["status"],
    valorRecebido: linha.valorRecebido === null ? null : numeroDecimal(linha.valorRecebido),
    valorEspecieDeclarado: linha.valorEspecieDeclarado === null ? null : numeroDecimal(linha.valorEspecieDeclarado),
    valorMoedasDeclarado: linha.valorMoedasDeclarado === null ? null : numeroDecimal(linha.valorMoedasDeclarado),
    prazoConfirmacaoEm: linha.prazoConfirmacaoEm?.toISOString() ?? null,
    dataRecebimento: linha.dataRecebimento?.toISOString() ?? null,
    criadoEm: linha.criadoEm.toISOString(),
    ehCaixaParaCofre: ehRetornoDoCaixa({
      caixaId: linha.caixaId,
      tipo
    }),
    ehPlanejamentoRetorno: planejamentoOrigemTransferenciaId !== null,
    possuiPlanejamentoRetorno: idsPaisComPlanejamento.has(linha.id)
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
      valorEspecieDeclarado: dados.valorEspecieDeclarado === undefined ? null : dados.valorEspecieDeclarado.toFixed(2),
      valorMoedasDeclarado: dados.valorMoedasDeclarado === undefined ? null : dados.valorMoedasDeclarado.toFixed(2),
      nLacreDoc: dados.nLacreDoc ?? null,
      agendadaPara: dados.agendadaPara ? new Date(dados.agendadaPara) : null,
      tempoConfirmacao: dados.tempoConfirmacao,
      prazoConfirmacaoEm:
        dados.agendadaPara || !dados.tempoConfirmacao
          ? null
          : calcularPrazoConfirmacao(new Date(), dados.tempoConfirmacao),
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
      // O lacre da transferencia inicial sela a SAIDA do malote. A abertura do Caixa procura
      // exatamente esta ponta para reivindicar e romper o lacre no mesmo ato (R-027/R-040).
      origem: "saida"
    });
  }
  if (dados.lacresRetorno.length) {
    await db.insert(lacres).values(
      dados.lacresRetorno.map((numero) => ({
        empresaId: dados.empresaId,
        numero,
        // A bolsa menor segue aberta dentro do malote de ida. O vinculo com a transferencia de
        // retorno so existe quando o Caixa a escolhe e fecha fisicamente a bolsa.
        transferenciaDistribuicaoId: transferencia.id,
        origem: "retorno" as const
      }))
    );
  }
  if (dados.lacreFechamentoPlanejado?.trim()) {
    await db.insert(lacres).values({
      empresaId: dados.empresaId,
      numero: dados.lacreFechamentoPlanejado.trim(),
      // Segue ABERTO dentro do malote principal. A abertura vincula esta transferencia ao Caixa;
      // no fechamento o numero digitado e conferido e o lacre e rompido no mesmo commit.
      transferenciaId: transferencia.id,
      origem: "fechamento"
    });
  }
  return transferencia;
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

// A confirmacao generica deve bloquear somente a transferencia PAI. A filha executada precisa
// continuar confirmavel no destino; `transferenciaTemPlanejamentoRepository` inclui ambas porque
// pai e filha sao imutaveis no editor.
export async function transferenciaPossuiRetornosPlanejadosRepository(
  transferenciaId: string,
  db: ExecutorBanco = banco
): Promise<boolean> {
  const [linha] = await db
    .select({ id: transferencias.id })
    .from(transferencias)
    .where(eq(transferencias.planejamentoOrigemTransferenciaId, transferenciaId))
    .limit(1);
  return Boolean(linha);
}

// O lacre de fechamento já foi separado fisicamente e segue o malote. Editar a transferencia sem
// reescrever o lacre criaria um segundo caminho ou deixaria uma reserva órfã; por isso o malote
// com esse selo é imutável, tal como o que possui bolsas de retorno planejadas.
export async function transferenciaPossuiLacreFechamentoPlanejadoRepository(
  transferenciaId: string,
  db: ExecutorBanco = banco
): Promise<boolean> {
  const [lacre] = await db
    .select({ id: lacres.id })
    .from(lacres)
    .where(and(eq(lacres.transferenciaId, transferenciaId), eq(lacres.origem, "fechamento")))
    .limit(1);
  return Boolean(lacre);
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
    // Lacres internos so existem no ato de criacao do malote; edicoes nunca os reescrevem.
    lacresRetorno: [],
    contasDestinoIds: candidatos
      .map((item) => item.contaId)
      .filter((contaId) => contaId !== transferencia.contaDestinoId),
    tempoConfirmacao: transferencia.tempoConfirmacao as TempoConfirmacao | null,
    agendadaPara: transferencia.agendadaPara?.toISOString() ?? null,
    prazoConfirmacaoEm: transferencia.prazoConfirmacaoEm?.toISOString() ?? null,
    dataRecebimento: transferencia.dataRecebimento?.toISOString() ?? null
  };
}

// --- Conferencia da Transferencia de retorno ------------------------------------------------
// O contexto que decide se esta transferencia esta sob as regras ESTRITAS do retorno do Caixa
// (valor obrigatorio, divergencia vira recusa auditavel) ou sob o comportamento generico vigente.
//
// O fluxo novo exige caixa vinculado e tipo `retorno`; `sangria` permanece somente para historico.
export type ContextoConferencia = {
  id: string;
  empresaId: string;
  status: string;
  valorCentavos: number;
  valorEspecieDeclaradoCentavos: number | null;
  valorMoedasDeclaradoCentavos: number | null;
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
  ehRetornoDoCaixa: boolean;
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
      valorEspecieDeclarado: transferencias.valorEspecieDeclarado,
      valorMoedasDeclarado: transferencias.valorMoedasDeclarado,
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

  const retornoDoCaixa = ehRetornoDoCaixa(linha);

  return {
    id: linha.id,
    empresaId: linha.empresaId,
    status: linha.status,
    valorCentavos: paraCentavos(linha.valorOriginal),
    valorEspecieDeclaradoCentavos:
      linha.valorEspecieDeclarado === null ? null : paraCentavos(linha.valorEspecieDeclarado),
    valorMoedasDeclaradoCentavos: linha.valorMoedasDeclarado === null ? null : paraCentavos(linha.valorMoedasDeclarado),
    lacre: linha.lacre,
    criadoPor: linha.criadoPor,
    executadoPor: linha.executadoPor,
    caixaId: linha.caixaId,
    contaCofreId: linha.contaCofreId,
    ehRetornoDoCaixa: retornoDoCaixa
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
// destino e, como regra, nao pode ser quem criou ou executou o movimento (R-028). A Tesouraria
// recebe a excecao operacional R-189 no SERVICO; ela ainda precisa deste vinculo, da empresa e da
// permissao efetiva. Este repositorio apenas recebe a decisao de perfil ja tomada acima.
//
// Extraida para ser a fonte unica de `confirmar` e `recusar-conferencia`: duas copias da mesma
// pergunta divergiriam, e a recusa passaria a aceitar quem a confirmacao recusa.
async function candidatoConfirmacao(
  transferenciaId: string,
  contaDestinoId: string,
  usuarioId: string,
  permitirAutoconferenciaTesouraria: boolean,
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
    .innerJoin(
      transferencias,
      and(
        eq(transferencias.id, transferenciasDestinosCandidatos.transferenciaId),
        eq(transferencias.empresaId, transferenciasDestinosCandidatos.empresaId)
      )
    )
    .innerJoin(
      contasUsuarios,
      and(
        eq(contasUsuarios.contaId, transferenciasDestinosCandidatos.contaId),
        eq(contasUsuarios.empresaId, transferencias.empresaId),
        eq(contasUsuarios.usuarioId, usuarioId)
      )
    )
    .where(
      and(
        eq(transferenciasDestinosCandidatos.transferenciaId, transferenciaId),
        eq(transferenciasDestinosCandidatos.contaId, contaDestinoId)
      )
    )
    .limit(1);
  if (
    !permitida ||
    (!permitirAutoconferenciaTesouraria && (permitida.criadoPor === usuarioId || permitida.executadoPor === usuarioId))
  ) {
    return null;
  }
  return permitida;
}

export async function ehConfirmadorElegivelRepository(
  input: {
    transferenciaId: string;
    contaId: string;
    usuarioId: string;
    permitirAutoconferenciaTesouraria?: boolean;
  },
  db: ExecutorBanco = banco
): Promise<boolean> {
  return Boolean(
    await candidatoConfirmacao(
      input.transferenciaId,
      input.contaId,
      input.usuarioId,
      input.permitirAutoconferenciaTesouraria ?? false,
      db
    )
  );
}

export async function confirmarTransferenciaRepository(
  transferenciaId: string,
  dados: ConfirmarTransferenciaPayload,
  usuarioId: string,
  permitirAutoconferenciaTesouraria = false,
  db: ExecutorBanco = banco
) {
  const permitida = await candidatoConfirmacao(
    transferenciaId,
    dados.contaDestinoId,
    usuarioId,
    permitirAutoconferenciaTesouraria,
    db
  );
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
    .where(and(eq(transferencias.status, "agendada"), lt(transferencias.agendadaPara, agora)))
    .orderBy(transferencias.caixaId, transferencias.id);
}

export async function efetivarTransferenciaAgendadaRepository(
  transferenciaId: string,
  prazo: TempoConfirmacao | null,
  agora: Date,
  db: TransacaoBanco
) {
  const [linha] = await db
    .update(transferencias)
    .set({
      status: "pendente",
      prazoConfirmacaoEm: prazo ? calcularPrazoConfirmacao(agora, prazo) : null,
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

export async function transferenciaAdmitePrazoRepository(transferenciaId: string, db: ExecutorBanco = banco) {
  const [transferencia] = await db
    .select({ tipo: transferencias.tipo, empresaId: transferencias.empresaId })
    .from(transferencias)
    .where(eq(transferencias.id, transferenciaId))
    .limit(1);
  if (!transferencia || transferencia.tipo === "retorno" || transferencia.tipo === "sangria") return false;
  const [destinos] = await db
    .select({ total: count() })
    .from(transferenciasDestinosCandidatos)
    .where(
      and(
        eq(transferenciasDestinosCandidatos.transferenciaId, transferenciaId),
        eq(transferenciasDestinosCandidatos.empresaId, transferencia.empresaId)
      )
    );
  return Number(destinos?.total ?? 0) <= 1;
}

export async function listarDestinatariosTransferenciaRepository(transferenciaId: string, db: ExecutorBanco = banco) {
  return db
    .selectDistinct({ usuarioId: contasUsuarios.usuarioId, contaId: transferenciasDestinosCandidatos.contaId })
    .from(transferenciasDestinosCandidatos)
    .innerJoin(
      transferencias,
      and(
        eq(transferencias.id, transferenciasDestinosCandidatos.transferenciaId),
        eq(transferencias.empresaId, transferenciasDestinosCandidatos.empresaId)
      )
    )
    .innerJoin(
      contasUsuarios,
      and(
        eq(contasUsuarios.contaId, transferenciasDestinosCandidatos.contaId),
        eq(contasUsuarios.empresaId, transferencias.empresaId)
      )
    )
    .where(eq(transferenciasDestinosCandidatos.transferenciaId, transferenciaId));
}

export async function listarTravamentosTransferenciaDoUsuarioRepository(
  input: { usuarioId: string; podeConferir: boolean },
  db: ExecutorBanco = banco
) {
  return db
    .selectDistinct({ id: transferencias.id, empresaId: transferencias.empresaId })
    .from(transferencias)
    .leftJoin(
      transferenciasDestinosCandidatos,
      and(
        eq(transferenciasDestinosCandidatos.transferenciaId, transferencias.id),
        eq(transferenciasDestinosCandidatos.empresaId, transferencias.empresaId)
      )
    )
    .leftJoin(
      contasUsuarios,
      and(
        eq(contasUsuarios.contaId, transferenciasDestinosCandidatos.contaId),
        eq(contasUsuarios.empresaId, transferencias.empresaId)
      )
    )
    .where(
      and(
        eq(transferencias.status, "pendente"),
        lt(transferencias.prazoConfirmacaoEm, new Date()),
        isNull(transferencias.travaLiberadaEm),
        input.podeConferir
          ? or(
              eq(transferencias.criadoPor, input.usuarioId),
              and(
                eq(contasUsuarios.usuarioId, input.usuarioId),
                or(isNull(transferencias.executadoPor), ne(transferencias.executadoPor, input.usuarioId))
              )
            )
          : eq(transferencias.criadoPor, input.usuarioId)
      )
    );
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
  const destinos = [...new Set([dados.contaDestinoId, ...dados.contasDestinoIds])];
  await db
    .delete(transferenciasDestinosCandidatos)
    .where(eq(transferenciasDestinosCandidatos.transferenciaId, transferenciaId));
  await db.insert(transferenciasDestinosCandidatos).values(
    destinos.map((contaId) => ({
      empresaId: dados.empresaId,
      transferenciaId,
      contaId
    }))
  );
}
