import type {
  AcaoHistoricoProcesso,
  MotivoCancelamento,
  OrigemProcesso,
  PrazoTeste,
  ResultadoTeste,
  SituacaoExame,
  SituacaoProcesso,
  SituacaoTeste,
  StatusProcesso,
  StatusTeste
} from "@padaria/shared";

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
 * D-2 do PROJECT_BRAIN/31 proibe.
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
  cancelado: "Cancelado e arquivado"
};

export const rotuloSituacaoProcesso: Record<SituacaoProcesso, string> = {
  ativo: "Ativo",
  inativo: "Inativo"
};

/** De onde a situacao vem. Sem isto, "Ativo" ao lado de "Iniciado" parece um segundo campo. */
export const explicacaoSituacaoProcesso: Record<SituacaoProcesso, string> = {
  ativo: "Ativo porque a admissão está em andamento",
  inativo: "Inativo porque o processo foi cancelado"
};

export const rotuloAcaoHistoricoProcesso: Record<AcaoHistoricoProcesso, string> = {
  criado: "Admissão iniciada",
  cancelado: "Cancelado e arquivado",
  internos_alterados: "Dados internos alterados",
  exame_alterado: "Exame admissional atualizado"
};

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
  realizado: "Realizado",
  exige_acao: "Exige ação"
};

/** Enquanto não for "Realizado", o DP vê o aviso. A regra é do servidor; aqui só a cor. */
export function corSituacaoExame(situacao: SituacaoExame) {
  if (situacao === "realizado") return "success";
  return situacao === "exige_acao" ? "error" : "warning";
}

export function corStatusProcesso(status: StatusProcesso) {
  return status === "iniciado" ? "primary" : "warning";
}

export function corPrazoTeste(prazo: PrazoTeste | null) {
  if (prazo === "vencido") return "error";
  if (prazo === "vence_hoje") return "warning";
  return undefined;
}
