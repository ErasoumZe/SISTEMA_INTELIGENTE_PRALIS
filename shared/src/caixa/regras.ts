// Formula oficial de saldo do caixa (ADR-001 — fechamento unico por caixaId).
// Toda a aritmetica acontece em centavos inteiros; conversao para reais so na borda.
export type TotaisCaixaCentavos = {
  entradas: number;
  transferencias: number;
  transferenciasEntrada: number;
  transferenciasSaida: number;
  despesas: number;
  retiradas: number;
  mercadorias: number;
};

export function saldoCaixaCentavos(totais: TotaisCaixaCentavos): number {
  return (
    totais.entradas +
    totais.transferenciasEntrada -
    totais.transferenciasSaida -
    totais.despesas -
    totais.retiradas -
    totais.mercadorias
  );
}
