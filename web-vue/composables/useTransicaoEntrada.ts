const CHAVE_TRANSICAO_ENTRADA = "cicluz:transicao-entrada";

/**
 * Marca uma única transição visual para o próximo carregamento autenticado. A marca fica na
 * sessionStorage: uma atualização de página depois do login não repete a animação.
 */
export function agendarTransicaoEntrada() {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(CHAVE_TRANSICAO_ENTRADA, "1");
}

/** Consome a transição sem deixar um segundo caminho persistente para o painel. */
export function consumirTransicaoEntrada() {
  if (typeof window === "undefined") return false;
  const agendada = window.sessionStorage.getItem(CHAVE_TRANSICAO_ENTRADA) === "1";
  window.sessionStorage.removeItem(CHAVE_TRANSICAO_ENTRADA);
  return agendada;
}
