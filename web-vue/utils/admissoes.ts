import type { MotivoCancelamento, PrazoTeste, ResultadoTeste, SituacaoTeste, StatusTeste } from "@padaria/shared";

// Rotulos em UM lugar so: a lista, o formulario e o painel de detalhe mostram os mesmos estados, e
// tres copias divergiriam no primeiro ajuste de texto.

export const rotuloStatusTeste: Record<StatusTeste, string> = {
  em_teste: "Em teste",
  encerrado: "Encerrado",
  cancelado: "Cancelado"
};

export const rotuloSituacaoTeste: Record<SituacaoTeste, string> = {
  ativo: "Ativo",
  inativo: "Inativo"
};

export const rotuloResultadoTeste: Record<ResultadoTeste, string> = {
  aprovado_para_admissao: "Aprovado para admissão",
  nao_prosseguir: "Não prosseguir"
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

export function corPrazoTeste(prazo: PrazoTeste | null) {
  if (prazo === "vencido") return "error";
  if (prazo === "vence_hoje") return "warning";
  return undefined;
}
