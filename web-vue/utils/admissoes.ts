import type {
  AcaoHistoricoProcesso,
  MotivoCancelamento,
  OrigemProcesso,
  PrazoTeste,
  ResultadoTeste,
  SituacaoExame,
  SituacaoFicha,
  SituacaoProcesso,
  SituacaoTeste,
  StatusProcesso,
  StatusTeste
} from "@padaria/shared";
import type { DiaSemana, EtiquetaTurno } from "@padaria/shared/turnos";

// Rotulos em UM lugar so: a lista, o formulario e o painel de detalhe mostram os mesmos estados, e
// tres copias divergiriam no primeiro ajuste de texto.

// O ESTADO TECNICO do teste. Sao os tres do banco, e nao ha um quarto.
//
// `cancelado` le "Cancelado e arquivado" porque a palavra sozinha nao diz o que aconteceu com o
// registro. Quem cancela precisa saber, na propria etiqueta, que o cadastro continua la.
export const rotuloStatusTeste: Record<StatusTeste, string> = {
  em_teste: "Em teste",
  encerrado: "Encerrado",
  cancelado: "Cancelado e arquivado"
};

// A SITUACAO na empresa, DERIVADA do status por `situacaoDoTeste` em `shared`. Nao existe coluna,
// nem campo de formulario, nem filtro paralelo — e nao pode passar a existir.
export const rotuloSituacaoTeste: Record<SituacaoTeste, string> = {
  ativo: "Ativo",
  inativo: "Inativo"
};

/**
 * De onde vem a situacao. Texto curto, para a tela nao deixar a derivacao implicita.
 *
 * Sem isto, "Ativo" ao lado de "Em teste" parece um segundo campo que alguem escolheu — e o passo
 * seguinte e alguem pedir para "mudar para Inativo sem encerrar", que e o estado paralelo que a
 * D-2 do PROJECT_BRAIN/42 proibe.
 */
export const explicacaoSituacaoTeste: Record<SituacaoTeste, string> = {
  ativo: "Ativo porque o teste está em andamento",
  inativo: "Inativo porque o teste foi encerrado ou cancelado"
};

// O RESULTADO GRAVADO, como ele aparece no registro depois de encerrado. E um estado, nao um
// comando — o painel le "Resultado: Aprovado para admissão".
export const rotuloResultadoTeste: Record<ResultadoTeste, string> = {
  aprovado_para_admissao: "Aprovado para admissão",
  nao_prosseguir: "Não prosseguir"
};

/**
 * A ACAO de encerrar, como ela aparece na hora de ESCOLHER. Grava exatamente os mesmos dois valores.
 *
 * Separado de `rotuloResultadoTeste` de proposito: escolher e um imperativo ("Efetivar para
 * admissão"), o registro e um estado ("Aprovado para admissão"). Um so texto para os dois faria o
 * painel de um teste encerrado dizer "Resultado: Efetivar para admissão", que nao e o que aconteceu.
 */
export const rotuloAcaoEncerramento: Record<ResultadoTeste, string> = {
  aprovado_para_admissao: "Efetivar para admissão",
  nao_prosseguir: "Encerrar sem prosseguir"
};

/** O que cada escolha faz — e, no caso positivo, o que ela ainda NAO faz. */
export const ajudaAcaoEncerramento: Record<ResultadoTeste, string> = {
  aprovado_para_admissao:
    "Marca o teste como aprovado para admissão. O convite e a solicitação de documentos serão criados na próxima etapa.",
  nao_prosseguir: "Encerra o período de teste sem seguir para admissão. O registro fica Inativo."
};

export const rotuloMotivoCancelamento: Record<MotivoCancelamento, string> = {
  nao_aprovado_no_teste: "Não aprovado no teste",
  sem_continuidade_apos_dia_de_teste: "Sem continuidade após o dia de teste"
};

// `no_prazo` NAO tem rotulo: ausencia de alerta e ausencia de texto. Colocar "no prazo" na linha
// transformaria o silencio (o caso comum) em ruido visual repetido em toda a lista.
export const rotuloPrazoTeste: Record<Exclude<PrazoTeste, "no_prazo">, string> = {
  vence_hoje: "Vence hoje",
  vencido: "Vencido"
};

/**
 * Cor do chip de status.
 *
 * `warning` para cancelado e nao `error`: cancelar e um desfecho previsto do processo, nao uma
 * falha do sistema. Vermelho fica reservado para o prazo vencido, que e a unica coisa nesta tela
 * que realmente pede acao de alguem.
 */
export function corStatusTeste(status: StatusTeste) {
  if (status === "em_teste") return "primary";
  if (status === "encerrado") return "success";
  return "warning";
}

// =================================================================================================
// ADM-002 — processo de admissao. Mesmo idioma dos rotulos do teste, e pelo mesmo motivo: a tela
// nunca reimplementa a regra, so exibe o que o servidor derivou.
// =================================================================================================

export const rotuloStatusProcesso: Record<StatusProcesso, string> = {
  iniciado: "Iniciado",
  pausado: "Pausado",
  cancelado: "Cancelado e arquivado"
};

export const rotuloSituacaoProcesso: Record<SituacaoProcesso, string> = {
  ativo: "Ativo",
  pausado: "Pausado",
  inativo: "Inativo"
};

/** De onde a situacao vem. Sem isto, "Ativo" ao lado de "Iniciado" parece um segundo campo. */
export const explicacaoSituacaoProcesso: Record<SituacaoProcesso, string> = {
  ativo: "Ativo porque a admissão está em andamento",
  pausado: "Pausado porque o exame admissional voltou não apto",
  inativo: "Inativo porque o processo foi cancelado"
};

export const rotuloAcaoHistoricoProcesso: Record<AcaoHistoricoProcesso, string> = {
  criado: "Admissão iniciada",
  cancelado: "Cancelado e arquivado",
  internos_alterados: "Dados internos alterados",
  exame_alterado: "Exame admissional atualizado",
  pausado: "Processo pausado (ASO não apto)",
  retomado: "Processo retomado (ASO apto)",
  cpf_revelado: "CPF revelado",
  // ADM-003 V2/V3. Convite e ficha sao atos sobre o MESMO processo, e por isso aparecem na
  // mesma linha do tempo — o DP le tudo num lugar so.
  convite_gerado: "Convite gerado",
  convite_revogado: "Convite revogado",
  ficha_enviada: "Ficha enviada pelo candidato",
  ficha_devolvida: "Ficha devolvida para correção",
  ficha_aprovada: "Ficha aprovada",
  efetivado: "Colaborador efetivado"
};

/**
 * ADM-003 V1B — turno. A etiqueta é como a operação fala do turno; os dias vêm do mesmo vocabulário
 * de `colaboradores_jornadas`, para não existirem dois nomes para segunda-feira.
 */
export const rotuloEtiquetaTurno: Record<EtiquetaTurno, string> = {
  M: "M · Manhã",
  T: "T · Tarde",
  I: "I · Integral"
};

const rotuloDiaSemana: Record<DiaSemana, string> = {
  SEGUNDA: "seg",
  TERCA: "ter",
  QUARTA: "qua",
  QUINTA: "qui",
  SEXTA: "sex",
  SABADO: "sáb",
  DOMINGO: "dom"
};

export function rotuloDiaSemanaCurto(dia: string): string {
  return rotuloDiaSemana[dia as DiaSemana] ?? dia;
}

/** O retrato do turno numa linha: etiqueta, dias e horários. Vazio vira "—", nunca inventa. */
export function rotuloTurnoDoProcesso(processo: {
  turnoEtiqueta: string | null;
  turnoHoraInicio: string | null;
  turnoHoraFim: string | null;
  turnoDiasSemana: string[] | null;
}): string | null {
  if (!processo.turnoEtiqueta) return null;
  const dias = processo.turnoDiasSemana?.map(rotuloDiaSemanaCurto).join(", ") ?? "";
  const inicio = processo.turnoHoraInicio?.slice(0, 5) ?? "";
  const fim = processo.turnoHoraFim?.slice(0, 5) ?? "";
  const etiqueta = rotuloEtiquetaTurno[processo.turnoEtiqueta as EtiquetaTurno] ?? processo.turnoEtiqueta;
  return [etiqueta, dias, `${inicio}–${fim}`].filter(Boolean).join(" · ");
}

/** De onde o processo nasceu. SÓ LEITURA — a origem se registra, não se escolhe. */
export const rotuloOrigemProcesso: Record<OrigemProcesso, string> = {
  teste_efetivado: "Período de teste efetivado",
  admissao_direta: "Admissão direta"
};

/**
 * O nome só existe quando veio de um período de teste. No processo direto ele chega depois, com a
 * resposta do candidato — e até lá a tela diz isso, em vez de mostrar um traço ou inventar
 * identidade para preencher o vazio.
 */
export function rotuloIdentidadeProcesso(nomeCompleto: string | null): string {
  return nomeCompleto ?? "Aguardando dados do candidato";
}

export const rotuloSituacaoExame: Record<SituacaoExame, string> = {
  pendente: "Pendente",
  guia_entregue: "Guia entregue",
  agendado: "Agendado",
  aso_apto: "ASO apto",
  aso_nao_apto: "ASO não apto",
  exige_acao: "Exige ação"
};

/** Enquanto não for "ASO apto", o DP vê o aviso. A regra é do servidor; aqui só a cor. */
export function corSituacaoExame(situacao: SituacaoExame) {
  if (situacao === "aso_apto") return "success";
  // Não apto e exige ação são os dois que pedem decisão humana — os demais só esperam.
  return situacao === "aso_nao_apto" || situacao === "exige_acao" ? "error" : "warning";
}

export function corStatusProcesso(status: StatusProcesso) {
  if (status === "iniciado") return "primary";
  return status === "pausado" ? "error" : "warning";
}

export function corPrazoTeste(prazo: PrazoTeste | null) {
  if (prazo === "vencido") return "error";
  if (prazo === "vence_hoje") return "warning";
  return undefined;
}

/**
 * Cancelar vale de `iniciado` E de `pausado`; `cancelado` e terminal.
 *
 * A tela escondia o botao em `pausado` (`status === "iniciado"`), enquanto o servidor aceitava —
 * ver a guarda em `cancelarProcesso`, que recusa so `cancelado`. Um processo parado por ASO nao
 * apto e justamente um dos que o DP quer encerrar, entao esconder o botao deixava a pausa sem
 * saida pela tela. A regra mora aqui, num lugar so, para o painel nao a reescrever.
 */
export function processoCancelavel(status: StatusProcesso): boolean {
  return status !== "cancelado";
}

/**
 * Por que o seletor de turno esta vazio ou inutil. Quatro causas com quatro respostas diferentes, e
 * antes disto as quatro caiam na mesma frase — `turnos.every(nao completo)` e `true` em lista
 * vazia, entao "nenhum turno completo" aparecia igual para lista vazia, para falha de rede e para
 * turno de fato incompleto. O DP era mandado configurar etiqueta num turno que nem existia.
 */
export type DiagnosticoTurnos =
  | "ok"
  | "falha_carregamento"
  | "nenhum_cadastrado"
  | "todos_inativos"
  | "todos_incompletos";

export function diagnosticoTurnos(
  turnos: readonly { ativo: boolean; completo: boolean }[],
  falhouCarregamento: boolean
): DiagnosticoTurnos {
  // A falha vem primeiro: sem resposta do servidor, a lista vazia nao prova nada sobre o cadastro.
  if (falhouCarregamento) return "falha_carregamento";
  if (turnos.length === 0) return "nenhum_cadastrado";
  if (turnos.some((turno) => turno.completo)) return "ok";
  return turnos.every((turno) => !turno.ativo) ? "todos_inativos" : "todos_incompletos";
}

export const mensagemDiagnosticoTurnos: Record<Exclude<DiagnosticoTurnos, "ok">, string> = {
  falha_carregamento: "Não foi possível carregar os turnos. Tente novamente.",
  nenhum_cadastrado: "Nenhum turno cadastrado nesta empresa. Cadastre um turno antes de admitir.",
  todos_inativos: "Todos os turnos desta empresa estão inativos. Reative um turno para admitir.",
  todos_incompletos: "Nenhum turno desta empresa está completo. Configure etiqueta (M/T/I) e dias da semana."
};

/** Por que ESTE turno nao pode ser escolhido. Inativo e incompleto sao motivos diferentes. */
export function motivoTurnoIndisponivel(turno: { ativo: boolean; completo: boolean }): string | null {
  if (turno.completo) return null;
  return turno.ativo ? "incompleto" : "inativo";
}

// =================================================================================================
// ADM-003 V5 — a ficha do candidato, vista pelo DP. Mesma disciplina: o servidor grava a situacao,
// a tela so a nomeia. Nao existe quinto estado, e nao existe "em revisao" gravado — revisar e ler.
// =================================================================================================

export const rotuloSituacaoFicha: Record<SituacaoFicha, string> = {
  rascunho: "Em preenchimento",
  enviada: "Enviada — aguardando revisão",
  devolvida: "Devolvida para correção",
  aprovada: "Aprovada"
};

/** O que cada situacao significa para quem revisa, dito na tela para a chip nao virar enigma. */
export const explicacaoSituacaoFicha: Record<SituacaoFicha, string> = {
  rascunho: "O candidato abriu o link e ainda não enviou a ficha.",
  enviada: "O candidato enviou a ficha. Confira os dados e decida: aprovar ou devolver.",
  devolvida: "O DP devolveu a ficha; o candidato corrige pelo mesmo link e envia de novo.",
  aprovada: "A ficha foi aprovada. Ela não volta a ser editada pelo candidato."
};

/**
 * Cor da chip da ficha. `enviada` e a unica que pede acao do DP, e por isso e a unica em destaque
 * — o mesmo criterio do exame (`corSituacaoExame`): cor forte so onde ha decisao humana pendente.
 */
export function corSituacaoFicha(situacao: SituacaoFicha) {
  if (situacao === "enviada") return "primary";
  if (situacao === "aprovada") return "success";
  return situacao === "devolvida" ? "warning" : undefined;
}

/**
 * Aprovar e devolver so valem de `enviada`. E a regra do servidor (`FICHA_NAO_REVISAVEL`); aqui ela
 * decide se os botoes existem. Botao que o servidor recusa com 409 e o botao morto da D-8.1.
 */
export function fichaRevisavel(situacao: SituacaoFicha): boolean {
  return situacao === "enviada";
}

/**
 * A declaracao de dependentes tem TRES estados, e a tela do DP mostra os tres. `null` NAO e "nao
 * tem": e "nao respondeu" — o servidor recusa o envio nesse estado, entao numa ficha enviada ele so
 * aparece se alguem gravou por fora. Dizer "nao respondeu" e mais honesto que esconder.
 */
export function rotuloDeclaracaoDependentes(semDependentes: boolean | null): string {
  if (semDependentes === null) return "Não respondeu";
  return semDependentes ? "Declarou que não tem dependentes" : "Declarou que tem dependentes";
}

/**
 * ADM-003 V6 — a ficha PEDE ACAO do DP? So estes dois estados pedem.
 *
 * A lista mostra sinal apenas para eles, pelo mesmo criterio do prazo do teste: alerta so onde ha
 * decisao humana pendente. `aprovada`, `rascunho` e sem-ficha ficam silenciosos, porque repetir o
 * normal em toda linha vira ruido — e ruido esconde justamente a excecao.
 *
 * Quem quiser ver os outros estados usa o filtro, que aceita os quatro.
 */
export function fichaPedeAtencao(situacao: SituacaoFicha | null): boolean {
  return situacao === "enviada" || situacao === "devolvida";
}

/**
 * O icone do sinal. TERCEIRO canal, alem da forma (chip) e do texto — nunca a cor sozinha, que e o
 * que a WCAG 1.4.1 proibe. Quem nao distingue cor le o rotulo; quem le rapido reconhece a forma.
 */
export const iconeSituacaoFicha: Record<SituacaoFicha, string> = {
  rascunho: "mdi-pencil-outline",
  enviada: "mdi-clock-alert-outline",
  devolvida: "mdi-undo-variant",
  aprovada: "mdi-check-circle-outline"
};

/**
 * O caminho da tela de revisao. UM lugar monta a rota: o modal do processo leva para ca, e a
 * pagina e alcancada so por ele — nao ha item de menu, e nao deve haver.
 */
export function rotaRevisaoDaFicha(processoId: string): string {
  return `/admissoes_processos/${encodeURIComponent(processoId)}/ficha`;
}
