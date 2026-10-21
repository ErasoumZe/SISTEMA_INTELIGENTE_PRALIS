import { diaDaSemanaIso, diaNegocio, janelaDiaNegocio, somarDias } from "../datas/index.js";

/**
 * Prazo e rateio que a RODADA de cotacao (R-221) ainda usa. A cotacao por link da R-216, com calculo de
 * desconto por item e pagina propria, foi removida no E8: a rodada substituiu esse caminho inteiro.
 */

/** Prazo padrao da rodada, em dias uteis (segunda a sexta). Feriado nao e considerado: nao ha calendario. */
export const PRAZO_COTACAO_DIAS_UTEIS = 2;

/**
 * Fim do prazo: o FIM do N-esimo dia util contado a partir do dia seguinte ao envio, no fuso do
 * negocio. Enviado numa segunda as 10h, vale ate o fim da quarta. Enviado na sexta, vale ate o fim
 * da terca. Devolve o instante exclusivo (meia-noite do dia seguinte), igual a `janelaDiaNegocio`.
 */
export function expiracaoCotacao(agora: Date, diasUteis = PRAZO_COTACAO_DIAS_UTEIS): Date {
  let dia = diaNegocio(agora);
  let contados = 0;
  while (contados < diasUteis) {
    dia = somarDias(dia, 1);
    if (diaDaSemanaIso(dia) <= 5) contados += 1;
  }
  return janelaDiaNegocio(dia).fim;
}

/**
 * Rateio pelo maior resto: cada item recebe a parte inteira proporcional ao seu peso, e os centavos
 * que sobram vao, um a um, para quem teve a maior fracao. A soma das fatias e SEMPRE exatamente o
 * valor rateado (o frete da proposta, no E5) — nunca um centavo a mais ou a menos.
 */
export function ratear(valorCentavos: number, pesos: number[]): number[] {
  const total = pesos.reduce((soma, peso) => soma + peso, 0);
  if (valorCentavos <= 0 || total <= 0) return pesos.map(() => 0);
  const brutas = pesos.map((peso) => (valorCentavos * peso) / total);
  const fatias = brutas.map(Math.floor);
  let sobra = valorCentavos - fatias.reduce((soma, fatia) => soma + fatia, 0);
  const ordem = brutas
    .map((bruta, indice) => ({ indice, resto: bruta - Math.floor(bruta) }))
    .sort((a, b) => b.resto - a.resto || a.indice - b.indice);
  for (const { indice } of ordem) {
    if (sobra <= 0) break;
    fatias[indice] = (fatias[indice] ?? 0) + 1;
    sobra -= 1;
  }
  return fatias;
}
