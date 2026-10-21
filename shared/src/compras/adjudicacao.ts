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
