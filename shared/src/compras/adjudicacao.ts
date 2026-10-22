import { ratear } from "./cotacao.js";

/**
 * Nucleo de dinheiro da compra automatica (Fase 2, decisoes 1/5/12). PURO e testavel: nao toca banco.
 *
 * Frete (decisao 5): um valor por proposta, rateado pelo MAIOR RESTO apenas entre os itens LIVRES da
 * proposta no instante do envio (o chamador ja filtrou os livres). Peso = valor total do item (valor
 * unitario x quantidade), em centavos. A soma das fatias e exatamente o frete — nunca sobra nem falta
 * um centavo (garantia de `ratear`).
 *
 * Custo final unitario (gravado, nunca recalculado na leitura): valor unitario + a parte do frete que
 * cabe a uma unidade daquele item. Compra automatica (decisao 1): custo final <= preco-base congelado
 * nasce comprado; acima da base, ou sem base, vai para o Comprador.
 *
 * Reconciliacao ao centavo contra nota/compra: confirmar com Rodrigo antes do deploy (plano 54). A
 * conta aqui fecha por construcao (ratear soma exata); o que Rodrigo valida e a LEITURA do numero.
 */
export type ItemParaCusto = {
  // Identificador opaco (conviteItemId/rodadaItemId) so para devolver casado.
  ref: string;
  valorUnitario: number; // reais
  quantidade: number;
  precoBaseValor: number | null; // reais; null = sem base
};

export type CustoCalculado = {
  ref: string;
  freteRateado: number; // reais (2 casas)
  custoFinalUnitario: number; // reais (4 casas)
  compraAutomatica: boolean; // custo final <= base (e base existe)
};

function centavos(valor: number): number {
  return Math.round(valor * 100);
}

export function calcularCustoFinal(itens: ItemParaCusto[], frete: number): CustoCalculado[] {
  const freteCentavos = Math.max(centavos(frete || 0), 0);
  const pesos = itens.map((item) => Math.max(centavos(item.valorUnitario) * item.quantidade, 0));
  const freteFatias = ratear(freteCentavos, pesos);
  return itens.map((item, indice) => {
    const freteItemCentavos = freteFatias[indice] ?? 0;
    const freteRateado = freteItemCentavos / 100;
    // Parte do frete por unidade; custo final em 4 casas (numeric(14,4) no banco).
    const fretePorUnidade = item.quantidade > 0 ? freteRateado / item.quantidade : 0;
    const custoFinalUnitario = Number((item.valorUnitario + fretePorUnidade).toFixed(4));
    const compraAutomatica = item.precoBaseValor !== null && custoFinalUnitario <= item.precoBaseValor;
    return { ref: item.ref, freteRateado: Number(freteRateado.toFixed(2)), custoFinalUnitario, compraAutomatica };
  });
}

/** Margens de variacao de quantidade que o comprador escolhe (doc 57, José 22/10). */
export const MARGENS_VARIACAO = [10, 20, 30, 40] as const;
export type MargemVariacao = (typeof MARGENS_VARIACAO)[number];

/**
 * Limites aceitos para a quantidade (para menos e para mais) com a margem da rodada. Sem margem (rodada
 * de antes da regra): qualquer quantidade ate a pedida.
 */
export function limitesDaMargem(pedida: number, margem: number | null): { minimo: number; maximo: number } {
  if (margem === null) return { minimo: 0, maximo: pedida };
  const arredondar = (valor: number) => Math.round(valor * 1000) / 1000;
  return { minimo: arredondar(pedida * (1 - margem / 100)), maximo: arredondar(pedida * (1 + margem / 100)) };
}

export function quantidadeDentroDaMargem(pedida: number, informada: number, margem: number | null): boolean {
  if (!(informada > 0)) return false;
  const { minimo, maximo } = limitesDaMargem(pedida, margem);
  // Tolerancia de arredondamento de 3 casas (numeric(14,3)).
  return informada >= minimo - 0.0005 && informada <= maximo + 0.0005;
}
