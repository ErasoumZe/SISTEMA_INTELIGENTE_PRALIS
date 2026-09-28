import { and, asc, count, desc, eq, ne, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  admissoesProcessos,
  admissoesProcessosFicha,
  admissoesProcessosHistorico,
  admissoesProcessosInternos,
  admissoesTestes
} from "@padaria/db/schema/admissoes";
import { colaboradoresVinculos, funcoesOperacionais, perfisUsuarios, turnos } from "@padaria/db/schema/cadastro";
import { sqlTravarAdmissaoDaPessoa } from "@padaria/db/sessao";
import type {
  AcaoHistoricoProcesso,
  OrigemProcesso,
  ProcessosQuery,
  SituacaoExame,
  SituacaoFicha,
  SituacaoProcesso,
  StatusProcesso
} from "@padaria/shared/admissoes";
import type { DiaSemana, EtiquetaTurno } from "@padaria/shared/turnos";
import type { PaginationQuery, ResultadoPaginado } from "@padaria/shared/api";
import { banco, type TransacaoBanco } from "../banco/conexao.js";

// Aliases porque a MESMA tabela de perfis responde por tres papeis na mesma linha.
const perfilCriador = alias(perfisUsuarios, "perfil_criador_processo");
const perfilAtualizador = alias(perfisUsuarios, "perfil_atualizador_processo");
const perfilCancelador = alias(perfisUsuarios, "perfil_cancelador_processo");
const perfilAtor = alias(perfisUsuarios, "perfil_ator_processo");
const perfilExame = alias(perfisUsuarios, "perfil_exame_processo");
// A funcao pode vir de DOIS lugares, e nunca dos dois ao mesmo tempo: do teste (origem teste) ou do
// proprio processo (origem direta). Dois aliases porque sao dois joins distintos sobre a mesma
// tabela — e o `coalesce` no SELECT e a unica linha que resolve a origem para quem le.
const funcaoDoTeste = alias(funcoesOperacionais, "funcao_do_teste");
const funcaoDoProcesso = alias(funcoesOperacionais, "funcao_do_processo");

export type ProcessoLinha = {
  id: string;
  origem: OrigemProcesso;
  status: StatusProcesso;
  versao: number;
  // NULO na admissao direta. O CHECK do banco garante que so e nulo nessa origem.
  testeId: string | null;
  // NULO ate o candidato responder, no processo direto. Nao ha coluna de nome no processo.
  nomeCompleto: string | null;
  nomeCompletoDireto: string | null;
  cpf: string | null;
  funcaoNome: string | null;
  turnoEtiqueta: string | null;
  turnoRotulo: string | null;
  turnoHoraInicio: string | null;
  turnoHoraFim: string | null;
  turnoDiasSemana: string[] | null;
  jornadaHorario: string | null;
  criadoPorNome: string | null;
  criadoEm: Date;
  atualizadoPorNome: string | null;
  atualizadoEm: Date;
  canceladoPorNome: string | null;
  canceladoEm: Date | null;
  internosVersao: number;
  internosDataAdmissao: string | null;
  ctpsNumero: string | null;
  ctpsSerie: string | null;
  ctpsUf: string | null;
  pisPasepNit: string | null;
  observacoesRh: string | null;
  exameSituacao: SituacaoExame;
  exameAtualizadoPorNome: string | null;
  exameAtualizadoEm: Date | null;
  /** ADM-003 V6 — a situacao da ficha, ou `null` quando o candidato ainda nao abriu o link. */
  fichaSituacao: SituacaoFicha | null;
  fichaEnviadoEm: Date | null;
  vinculoId: string | null;
  dataEfetivacao: string | null;
};

/**
 * Cria o processo. Chamado DENTRO da transacao que encerra o teste — nunca sozinho.
 *
 * `onConflictDoNothing` sobre `admissoes_processos_teste_unico`: se duas transacoes concorrentes
 * passarem juntas pelo lock, a segunda nao grava e recebe `undefined`. Quem chama decide o que fazer
 * — e o que ele faz e buscar o processo que a outra criou.
 */
export async function criarProcessoRepository(
  input: { empresaId: string; testeId: string; atorUsuarioId: string },
  db: TransacaoBanco
) {
  const [linha] = await db
    .insert(admissoesProcessos)
    .values({
      empresaId: input.empresaId,
      testeId: input.testeId,
      criadoPor: input.atorUsuarioId,
      atualizadoPor: input.atorUsuarioId
    })
    .onConflictDoNothing({ target: admissoesProcessos.testeId })
    .returning({ id: admissoesProcessos.id, versao: admissoesProcessos.versao });
  return linha ?? null;
}

/**
 * Cria o processo da ADMISSAO DIRETA. Sem teste, com funcao e jornada proprias.
 *
 * `origem` vai explicita, e nao pelo default: o default existe para as linhas que ja estavam la, nao
 * para esconder a intencao de quem escreve. O CHECK de coerencia recusa a combinacao errada — este
 * insert e o unico lugar que pode produzir `admissao_direta`.
 */
export async function criarProcessoDiretoRepository(
  input: {
    empresaId: string;
    nomeCompleto: string;
    cpf: string;
    funcaoId: string;
    turnoId: string;
    turnoRotulo: string;
    turnoEtiqueta: EtiquetaTurno;
    turnoHoraInicio: string;
    turnoHoraFim: string;
    turnoDiasSemana: DiaSemana[];
    atorUsuarioId: string;
  },
  db: TransacaoBanco
) {
  const [linha] = await db
    .insert(admissoesProcessos)
    .values({
      empresaId: input.empresaId,
      origem: "admissao_direta",
      testeId: null,
      nomeCompleto: input.nomeCompleto,
      cpf: input.cpf,
      funcaoId: input.funcaoId,
      turnoId: input.turnoId,
      // RETRATO gravado no ato. Nao e copia do catalogo: e o que foi combinado com esta pessoa, e
      // precisa sobreviver a uma edicao futura do turno.
      turnoRotulo: input.turnoRotulo,
      turnoEtiqueta: input.turnoEtiqueta,
      turnoHoraInicio: input.turnoHoraInicio,
      turnoHoraFim: input.turnoHoraFim,
      turnoDiasSemana: input.turnoDiasSemana,
      // `jornadaHorario` NAO e escrita: ela existe so para o historico legado da V1A.
      criadoPor: input.atorUsuarioId,
      atualizadoPor: input.atorUsuarioId
    })
    .returning({ id: admissoesProcessos.id, versao: admissoesProcessos.versao });
  if (!linha) throw new Error("Processo de admissao direta nao criado");
  return linha;
}

/**
 * Serializa, DENTRO da transacao, tudo que decide sobre a mesma pessoa na mesma empresa.
 *
 * Precisa ser chamado nos DOIS caminhos — criar teste e criar admissao direta — antes de qualquer
 * leitura. Um lado so nao resolve nada: e justamente a corrida entre eles que indice nenhum alcanca,
 * porque indice nao cruza tabelas.
 */
export async function travarPessoaRepository(empresaId: string, cpf: string, db: TransacaoBanco) {
  await db.execute(sqlTravarAdmissaoDaPessoa(empresaId, cpf));
}

/** Existe processo NAO cancelado com este CPF nesta empresa? Le depois do lock, nunca antes. */
export async function existeProcessoAtivoPorCpfRepository(cpf: string, empresaId: string, db: TransacaoBanco) {
  const [linha] = await db
    .select({ id: admissoesProcessos.id })
    .from(admissoesProcessos)
    .where(
      and(
        eq(admissoesProcessos.cpf, cpf),
        eq(admissoesProcessos.empresaId, empresaId),
        ne(admissoesProcessos.status, "cancelado")
      )
    )
    .limit(1);
  return Boolean(linha);
}

/**
 * Os turnos da empresa, para o seletor da admissao.
 *
 * Devolve TODOS, inclusive os incompletos e inativos, com a marca — a tela precisa poder dizer "este
 * turno esta incompleto, configure no cadastro de Turnos" em vez de simplesmente nao mostrar e
 * deixar o DP procurando o que sumiu.
 */
export async function listarTurnosDaEmpresaRepository(empresaId: string) {
  return banco
    .select({
      id: turnos.id,
      nome: turnos.nome,
      etiqueta: turnos.etiqueta,
      diasSemana: turnos.diasSemana,
      horaInicio: turnos.horaInicio,
      horaFim: turnos.horaFim,
      ativo: turnos.ativo
    })
    .from(turnos)
    .where(eq(turnos.empresaId, empresaId))
    .orderBy(desc(turnos.ativo), asc(turnos.etiqueta), asc(turnos.nome));
}

/** O CPF do processo, para a revelacao auditada. Mesma disciplina da ADM-001. */
export async function obterCpfDoProcessoRepository(id: string, empresaId: string, db: TransacaoBanco) {
  const [linha] = await db
    .select({ cpf: admissoesProcessos.cpf, versao: admissoesProcessos.versao })
    .from(admissoesProcessos)
    .where(and(eq(admissoesProcessos.id, id), eq(admissoesProcessos.empresaId, empresaId)))
    .limit(1);
  return linha ?? null;
}

/**
 * O turno, com o que a admissao precisa para decidir se ele serve.
 *
 * Devolve a linha inteira, e nao um booleano: "nao existe nesta empresa" e "existe mas esta
 * incompleto" sao recusas diferentes, com mensagens diferentes.
 */
export async function obterTurnoDaEmpresaRepository(turnoId: string, empresaId: string, db: TransacaoBanco) {
  const [linha] = await db
    .select({
      id: turnos.id,
      nome: turnos.nome,
      etiqueta: turnos.etiqueta,
      diasSemana: turnos.diasSemana,
      horaInicio: turnos.horaInicio,
      horaFim: turnos.horaFim,
      ativo: turnos.ativo
    })
    .from(turnos)
    .where(and(eq(turnos.id, turnoId), eq(turnos.empresaId, empresaId)))
    .limit(1);
  return linha ?? null;
}

/** A funcao operacional existe nesta empresa, e esta ativa? */
export async function obterFuncaoAtivaRepository(funcaoId: string, empresaId: string, db: TransacaoBanco) {
  const [linha] = await db
    .select({ id: funcoesOperacionais.id, ativo: funcoesOperacionais.ativo })
    .from(funcoesOperacionais)
    .where(and(eq(funcoesOperacionais.id, funcaoId), eq(funcoesOperacionais.empresaId, empresaId)))
    .limit(1);
  return linha ?? null;
}

/**
 * O bloco interno nasce junto do processo, nas DUAS origens, para que a tela nunca precise decidir
 * entre criar e atualizar — e para que o exame comece em `pendente` desde o primeiro instante.
 */
export async function criarInternosRepository(
  input: { empresaId: string; processoId: string; dataAdmissao: string | null },
  db: TransacaoBanco
) {
  await db.insert(admissoesProcessosInternos).values({
    empresaId: input.empresaId,
    processoId: input.processoId,
    dataAdmissao: input.dataAdmissao
  });
}

/** Trava o bloco interno antes de validar. Mesmo padrao do processo e da ADM-001. */
export async function bloquearInternosRepository(processoId: string, empresaId: string, db: TransacaoBanco) {
  const [linha] = await db
    .select({
      id: admissoesProcessosInternos.id,
      versao: admissoesProcessosInternos.versao,
      exameSituacao: admissoesProcessosInternos.exameSituacao
    })
    .from(admissoesProcessosInternos)
    .where(
      and(eq(admissoesProcessosInternos.processoId, processoId), eq(admissoesProcessosInternos.empresaId, empresaId))
    )
    .limit(1)
    .for("no key update");
  return linha ?? null;
}

/** A linha do processo ja esta travada por quem chama; esta leitura decide se a data virou historico. */
export async function obterVinculoEfetivadoRepository(processoId: string, empresaId: string, db: TransacaoBanco) {
  const [linha] = await db
    .select({ admitidoEm: colaboradoresVinculos.admitidoEm })
    .from(colaboradoresVinculos)
    .where(and(eq(colaboradoresVinculos.processoId, processoId), eq(colaboradoresVinculos.empresaId, empresaId)))
    .limit(1);
  return linha ?? null;
}

/** `versaoAtual` no WHERE: retorno nulo significa que alguem alterou no meio. */
export async function atualizarInternosRepository(
  input: {
    processoId: string;
    empresaId: string;
    versaoAtual: number;
    dataAdmissao: string | null;
    ctpsNumero: string | null;
    ctpsSerie: string | null;
    ctpsUf: string | null;
    pisPasepNit: string | null;
    observacoesRh: string | null;
  },
  db: TransacaoBanco
) {
  const [linha] = await db
    .update(admissoesProcessosInternos)
    .set({
      dataAdmissao: input.dataAdmissao,
      ctpsNumero: input.ctpsNumero,
      ctpsSerie: input.ctpsSerie,
      ctpsUf: input.ctpsUf,
      pisPasepNit: input.pisPasepNit,
      observacoesRh: input.observacoesRh,
      versao: input.versaoAtual + 1
    })
    .where(
      and(
        eq(admissoesProcessosInternos.processoId, input.processoId),
        eq(admissoesProcessosInternos.empresaId, input.empresaId),
        eq(admissoesProcessosInternos.versao, input.versaoAtual)
      )
    )
    .returning({ versao: admissoesProcessosInternos.versao });
  return linha ?? null;
}

/**
 * Avanca a versao do PROCESSO por um evento que nao muda o status.
 *
 * A trilha tem `unique (processo_id, versao)` — ela garante que repetir uma transicao nao grave dois
 * eventos. Editar o bloco interno tambem e um evento do processo, entao precisa da propria versao,
 * senao o segundo evento colide com o primeiro e a escrita inteira falha.
 *
 * Sao DUAS versoes com DOIS trabalhos, e nao uma duplicada: `internos.versao` responde "alguem
 * editou o formulario embaixo de mim"; `processos.versao` responde "quantos eventos este processo ja
 * teve". Um evento interno mexe nas duas, por motivos diferentes.
 */
export async function avancarVersaoProcessoRepository(
  input: { id: string; empresaId: string; versaoAtual: number; atorUsuarioId: string },
  db: TransacaoBanco
) {
  const [linha] = await db
    .update(admissoesProcessos)
    .set({ versao: input.versaoAtual + 1, atualizadoPor: input.atorUsuarioId })
    .where(
      and(
        eq(admissoesProcessos.id, input.id),
        eq(admissoesProcessos.empresaId, input.empresaId),
        eq(admissoesProcessos.versao, input.versaoAtual)
      )
    )
    .returning({ versao: admissoesProcessos.versao });
  return linha ?? null;
}

/**
 * Muda o STATUS do processo sem tocar nos campos de cancelamento. Serve a pausa e a retomada, que
 * sao consequencia de registrar o ASO — nunca atos proprios. Nao ha rota nem botao para elas.
 */
export async function definirStatusProcessoRepository(
  input: {
    id: string;
    empresaId: string;
    versaoAtual: number;
    status: "iniciado" | "pausado";
    atorUsuarioId: string;
  },
  db: TransacaoBanco
) {
  const [linha] = await db
    .update(admissoesProcessos)
    .set({ status: input.status, versao: input.versaoAtual + 1, atualizadoPor: input.atorUsuarioId })
    .where(
      and(
        eq(admissoesProcessos.id, input.id),
        eq(admissoesProcessos.empresaId, input.empresaId),
        eq(admissoesProcessos.versao, input.versaoAtual)
      )
    )
    .returning({ versao: admissoesProcessos.versao });
  return linha ?? null;
}

/** Exame: acao propria, com autoria e data proprias. */
export async function atualizarExameRepository(
  input: {
    processoId: string;
    empresaId: string;
    versaoAtual: number;
    situacao: SituacaoExame;
    atorUsuarioId: string;
    atualizadoEm: Date;
  },
  db: TransacaoBanco
) {
  const [linha] = await db
    .update(admissoesProcessosInternos)
    .set({
      exameSituacao: input.situacao,
      exameAtualizadoPor: input.atorUsuarioId,
      exameAtualizadoEm: input.atualizadoEm,
      versao: input.versaoAtual + 1
    })
    .where(
      and(
        eq(admissoesProcessosInternos.processoId, input.processoId),
        eq(admissoesProcessosInternos.empresaId, input.empresaId),
        eq(admissoesProcessosInternos.versao, input.versaoAtual)
      )
    )
    .returning({ versao: admissoesProcessosInternos.versao });
  return linha ?? null;
}

/** O processo deste teste, se existir. E o que sustenta o ramo idempotente da efetivacao. */
export async function obterProcessoPorTesteRepository(testeId: string, empresaId: string, db: TransacaoBanco) {
  const [linha] = await db
    .select({ id: admissoesProcessos.id, versao: admissoesProcessos.versao })
    .from(admissoesProcessos)
    .where(and(eq(admissoesProcessos.testeId, testeId), eq(admissoesProcessos.empresaId, empresaId)))
    .limit(1);
  return linha ?? null;
}

/**
 * Detalhe do processo.
 *
 * A empresa entra no proprio WHERE: "nao existe" e "e de outra empresa" produzem a MESMA resposta
 * vazia, entao a rota nao vira oraculo sobre processo de outro tenant.
 */
/**
 * A projecao do processo, valendo para as DUAS origens.
 *
 * O join com `admissoes_testes` e LEFT: na admissao direta nao ha teste, e um inner join faria o
 * processo direto sumir da propria consulta — bug silencioso, do tipo que so aparece em producao.
 *
 * `coalesce` resolve a origem em UMA linha: funcao e jornada vem do teste (herdadas) ou do proprio
 * processo (direta). Quem consome nao precisa saber de onde, e nao existe copia entre as duas.
 */
function selecaoProcesso() {
  return {
    id: admissoesProcessos.id,
    origem: admissoesProcessos.origem,
    status: admissoesProcessos.status,
    versao: admissoesProcessos.versao,
    testeId: admissoesProcessos.testeId,
    // A identidade vem do teste OU do proprio processo, nunca dos dois: o CHECK de coerencia torna a
    // coexistencia impossivel, e o `coalesce` resolve a origem numa linha so.
    nomeCompleto: sql<string | null>`coalesce(${admissoesTestes.nomeCompleto}, ${admissoesProcessos.nomeCompleto})`,
    nomeCompletoDireto: admissoesProcessos.nomeCompleto,
    cpf: sql<string | null>`coalesce(${admissoesTestes.cpf}, ${admissoesProcessos.cpf})`,
    funcaoNome: sql<string | null>`coalesce(${funcaoDoTeste.nome}, ${funcaoDoProcesso.nome})`,
    // RETRATO, nao catalogo: sai das colunas do processo. Se o turno mudar amanha, isto nao muda.
    turnoEtiqueta: admissoesProcessos.turnoEtiqueta,
    turnoRotulo: admissoesProcessos.turnoRotulo,
    turnoHoraInicio: admissoesProcessos.turnoHoraInicio,
    turnoHoraFim: admissoesProcessos.turnoHoraFim,
    turnoDiasSemana: admissoesProcessos.turnoDiasSemana,
    // HISTORICO LEGADO: so a origem direta da V1A tem. A do teste e proibida de ter, por CHECK.
    jornadaHorario: admissoesProcessos.jornadaHorario,
    // SO o nome. E-mail nunca entra na projecao.
    criadoPorNome: perfilCriador.nome,
    criadoEm: admissoesProcessos.criadoEm,
    atualizadoPorNome: perfilAtualizador.nome,
    atualizadoEm: admissoesProcessos.atualizadoEm,
    canceladoPorNome: perfilCancelador.nome,
    canceladoEm: admissoesProcessos.canceladoEm,
    internosVersao: admissoesProcessosInternos.versao,
    internosDataAdmissao: admissoesProcessosInternos.dataAdmissao,
    ctpsNumero: admissoesProcessosInternos.ctpsNumero,
    ctpsSerie: admissoesProcessosInternos.ctpsSerie,
    ctpsUf: admissoesProcessosInternos.ctpsUf,
    pisPasepNit: admissoesProcessosInternos.pisPasepNit,
    observacoesRh: admissoesProcessosInternos.observacoesRh,
    exameSituacao: admissoesProcessosInternos.exameSituacao,
    exameAtualizadoPorNome: perfilExame.nome,
    exameAtualizadoEm: admissoesProcessosInternos.exameAtualizadoEm,
    /**
     * ADM-003 V6 — a situacao da ficha, so isto. Nenhum campo dela entra aqui: a lista nao mostra
     * ficha, e o detalhe do processo nao a carrega. Quem le a ficha e a tela de revisao, pela rota
     * dela, com a permissao dela.
     *
     * `left join` porque processo sem ficha e o estado normal de quem ainda nao abriu o link, e a
     * unicidade por processo garante que ele nao multiplica linha.
     */
    fichaSituacao: sql<SituacaoFicha | null>`${admissoesProcessosFicha.situacao}`,
    /** So para ORDENAR a fila. Nao vai para o contrato: a lista nao mostra data de envio. */
    fichaEnviadoEm: admissoesProcessosFicha.enviadoEm,
    // O vinculo e a unica prova de efetivacao. Nao existe segundo status no processo.
    vinculoId: colaboradoresVinculos.id,
    dataEfetivacao: colaboradoresVinculos.admitidoEm
  };
}

/** A consulta base, com todos os joins. Cada um casa TAMBEM a empresa. */
function consultaProcesso() {
  return banco
    .select(selecaoProcesso())
    .from(admissoesProcessos)
    .leftJoin(
      admissoesTestes,
      and(
        eq(admissoesTestes.id, admissoesProcessos.testeId),
        eq(admissoesTestes.empresaId, admissoesProcessos.empresaId)
      )
    )
    .leftJoin(
      funcaoDoTeste,
      and(eq(funcaoDoTeste.id, admissoesTestes.funcaoId), eq(funcaoDoTeste.empresaId, admissoesTestes.empresaId))
    )
    .leftJoin(
      funcaoDoProcesso,
      and(
        eq(funcaoDoProcesso.id, admissoesProcessos.funcaoId),
        eq(funcaoDoProcesso.empresaId, admissoesProcessos.empresaId)
      )
    )
    .leftJoin(
      admissoesProcessosFicha,
      and(
        eq(admissoesProcessosFicha.processoId, admissoesProcessos.id),
        eq(admissoesProcessosFicha.empresaId, admissoesProcessos.empresaId)
      )
    )
    .leftJoin(
      admissoesProcessosInternos,
      and(
        eq(admissoesProcessosInternos.processoId, admissoesProcessos.id),
        eq(admissoesProcessosInternos.empresaId, admissoesProcessos.empresaId)
      )
    )
    .leftJoin(
      colaboradoresVinculos,
      and(
        eq(colaboradoresVinculos.processoId, admissoesProcessos.id),
        eq(colaboradoresVinculos.empresaId, admissoesProcessos.empresaId)
      )
    )
    .leftJoin(perfilCriador, eq(perfilCriador.usuarioId, admissoesProcessos.criadoPor))
    .leftJoin(perfilAtualizador, eq(perfilAtualizador.usuarioId, admissoesProcessos.atualizadoPor))
    .leftJoin(perfilCancelador, eq(perfilCancelador.usuarioId, admissoesProcessos.canceladoPor))
    .leftJoin(perfilExame, eq(perfilExame.usuarioId, admissoesProcessosInternos.exameAtualizadoPor));
}

/**
 * O bloco interno nasce junto do processo. O `??` cobre a linha da ADM-002 criada antes da 0036 —
 * sem ele, um processo antigo chegaria a tela com versao nula.
 */
type LinhaConsultada = Omit<ProcessoLinha, "internosVersao" | "exameSituacao"> & {
  internosVersao: number | null;
  exameSituacao: SituacaoExame | null;
};

function normalizar(linha: LinhaConsultada): ProcessoLinha {
  return {
    ...linha,
    internosVersao: linha.internosVersao ?? 1,
    exameSituacao: linha.exameSituacao ?? "pendente"
  };
}

/**
 * Detalhe do processo.
 *
 * A empresa entra no proprio WHERE: "nao existe" e "e de outra empresa" produzem a MESMA resposta
 * vazia, entao a rota nao vira oraculo sobre processo de outro tenant.
 */
export async function obterProcessoRepository(id: string, empresaId: string): Promise<ProcessoLinha | null> {
  const [linha] = await consultaProcesso()
    .where(and(eq(admissoesProcessos.id, id), eq(admissoesProcessos.empresaId, empresaId)))
    .limit(1);
  return linha ? normalizar(linha) : null;
}

/**
 * LISTA. Consulta e nada mais — nao ha aqui acao de iniciar, efetivar ou criar.
 *
 * Sem busca por nome e SEM busca por CPF: documento nunca entra em query string (D-4 do
 * PROJECT_BRAIN/42), e no processo direto o nome so existe depois da resposta do candidato.
 */
const STATUS_DA_SITUACAO: Record<SituacaoProcesso, StatusProcesso> = {
  ativo: "iniciado",
  // CORRECAO (V6): este mapa era um ternario `situacao === "ativo" ? "iniciado" : "cancelado"`, e
  // por isso filtrar por PAUSADO devolvia os CANCELADOS — os dois casos que nao eram "ativo" caiam
  // no mesmo galho. Um mapa fechado nao tem esse defeito: cada situacao aponta para o seu status, e
  // uma situacao nova quebra o typecheck em vez de cair no `else`.
  pausado: "pausado",
  inativo: "cancelado"
};

export async function listarProcessosRepository(
  empresaId: string,
  query: ProcessosQuery
): Promise<ResultadoPaginado<ProcessoLinha>> {
  const filtros: SQL[] = [eq(admissoesProcessos.empresaId, empresaId)];
  if (query.origem) filtros.push(eq(admissoesProcessos.origem, query.origem));
  if (query.situacao) filtros.push(eq(admissoesProcessos.status, STATUS_DA_SITUACAO[query.situacao]));
  if (query.ficha) filtros.push(eq(admissoesProcessosFicha.situacao, query.ficha));
  const where = and(...filtros);

  /**
   * A contagem repete o join da ficha porque um dos filtros mora nela. Sem o join aqui, filtrar por
   * `ficha` devolveria a pagina certa e um total errado — a paginacao passaria a mentir, que e o
   * jeito silencioso de esconder registro.
   *
   * O join nao infla a contagem: `admissoes_processos_ficha` tem unique por `processo_id`.
   */
  const [{ total } = { total: 0 }] = await banco
    .select({ total: count() })
    .from(admissoesProcessos)
    .leftJoin(
      admissoesProcessosFicha,
      and(
        eq(admissoesProcessosFicha.processoId, admissoesProcessos.id),
        eq(admissoesProcessosFicha.empresaId, admissoesProcessos.empresaId)
      )
    )
    .where(where);

  /**
   * FILA e LISTA ordenam ao contrario, e de proposito.
   *
   * A lista geral mostra o mais recente primeiro, que e o que se espera de um cadastro. Mas uma FILA
   * ordenada pelo mais recente faz quem esperou mais ficar por ultimo — entao, quando o filtro de
   * ficha esta ativo, a ordem passa a ser a da espera: quem enviou primeiro aparece primeiro.
   *
   * `asc` resolve o nulo sozinho: no Postgres, ordem ascendente ja poe NULL por ULTIMO. Rascunho nao
   * tem envio, e um nulo no topo poria quem nem enviou na frente de quem espera decisao — o que o
   * padrao do banco evita sem precisar de SQL cru, que o gate de arquitetura veta nesta camada.
   */
  const ordem = query.ficha
    ? [asc(admissoesProcessosFicha.enviadoEm), asc(admissoesProcessos.id)]
    : [desc(admissoesProcessos.criadoEm), desc(admissoesProcessos.id)];

  const itens = await consultaProcesso()
    .where(where)
    .orderBy(...ordem)
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);

  return { itens: itens.map(normalizar), total, page: query.page, pageSize: query.pageSize };
}

/** Bloqueia a linha antes de validar. Mesmo padrao da ADM-001. */
export async function bloquearProcessoRepository(id: string, empresaId: string, db: TransacaoBanco) {
  const [linha] = await db
    .select({
      id: admissoesProcessos.id,
      status: admissoesProcessos.status,
      versao: admissoesProcessos.versao
    })
    .from(admissoesProcessos)
    .where(and(eq(admissoesProcessos.id, id), eq(admissoesProcessos.empresaId, empresaId)))
    .limit(1)
    // `no key update` e nao `update`: o INSERT no historico toma FOR KEY SHARE implicito na linha pai
    // pela verificacao de FK, e FOR KEY SHARE conflita com FOR UPDATE.
    .for("no key update");
  return linha ?? null;
}

/** Cancela. `versaoAtual` no WHERE: retorno nulo significa que alguem alterou no meio. */
export async function cancelarProcessoRepository(
  input: {
    id: string;
    empresaId: string;
    versaoAtual: number;
    atorUsuarioId: string;
    canceladoEm: Date;
  },
  db: TransacaoBanco
) {
  const [linha] = await db
    .update(admissoesProcessos)
    .set({
      status: "cancelado",
      versao: input.versaoAtual + 1,
      atualizadoPor: input.atorUsuarioId,
      canceladoPor: input.atorUsuarioId,
      canceladoEm: input.canceladoEm
    })
    .where(
      and(
        eq(admissoesProcessos.id, input.id),
        eq(admissoesProcessos.empresaId, input.empresaId),
        eq(admissoesProcessos.versao, input.versaoAtual)
      )
    )
    .returning({ id: admissoesProcessos.id, versao: admissoesProcessos.versao });
  return linha ?? null;
}

export async function registrarEventoProcessoRepository(
  input: {
    processoId: string;
    empresaId: string;
    versao: number;
    acao: AcaoHistoricoProcesso;
    atorUsuarioId: string;
    camposAlterados?: string[];
  },
  db: TransacaoBanco
) {
  await db.insert(admissoesProcessosHistorico).values({
    processoId: input.processoId,
    empresaId: input.empresaId,
    versao: input.versao,
    acao: input.acao,
    atorUsuarioId: input.atorUsuarioId,
    camposAlterados: input.camposAlterados ?? []
  });
}

export async function listarHistoricoProcessoRepository(
  processoId: string,
  empresaId: string,
  query: PaginationQuery
): Promise<
  ResultadoPaginado<{
    id: string;
    versao: number;
    acao: AcaoHistoricoProcesso;
    atorNome: string | null;
    camposAlterados: string[];
    ocorridoEm: Date;
  }>
> {
  const filtros: SQL[] = [
    eq(admissoesProcessosHistorico.processoId, processoId),
    eq(admissoesProcessosHistorico.empresaId, empresaId)
  ];
  const where = and(...filtros);

  const [{ total } = { total: 0 }] = await banco
    .select({ total: count() })
    .from(admissoesProcessosHistorico)
    .where(where);

  const itens = await banco
    .select({
      id: admissoesProcessosHistorico.id,
      versao: admissoesProcessosHistorico.versao,
      acao: admissoesProcessosHistorico.acao,
      atorNome: perfilAtor.nome,
      camposAlterados: admissoesProcessosHistorico.camposAlterados,
      ocorridoEm: admissoesProcessosHistorico.ocorridoEm
    })
    .from(admissoesProcessosHistorico)
    .leftJoin(perfilAtor, eq(perfilAtor.usuarioId, admissoesProcessosHistorico.atorUsuarioId))
    .where(where)
    .orderBy(asc(admissoesProcessosHistorico.ocorridoEm), asc(admissoesProcessosHistorico.id))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);

  return { itens, total, page: query.page, pageSize: query.pageSize };
}
