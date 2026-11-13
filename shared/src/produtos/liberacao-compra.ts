/**
 * Liberado para compra (decisão do José, 13/11/2026, igual ao S2; substitui o "começa desligado" do doc 59):
 * - produto novo de REVENDA nasce liberado; transformação (feito na casa) nasce desligado;
 * - produto inativo nunca fica liberado: inativar desliga a liberação.
 */

/** Liberação inicial de um produto novo. */
export function liberadoCompraAoCriar(tipo: string | null | undefined): boolean {
  return tipo === "revenda";
}

/** Liberação que vai para o banco: inativo nunca fica liberado. */
export function liberadoCompraAoGravar(status: string | null | undefined, liberadoCompra: boolean): boolean {
  return status === "inativo" ? false : liberadoCompra;
}

/** Frase que o administrador digita para liberar a revenda ativa em lote. */
export const CONFIRMACAO_LIBERAR_REVENDA = "LIBERAR REVENDA PARA COMPRA";
