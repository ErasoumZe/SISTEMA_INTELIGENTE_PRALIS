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

// NOTA (24/07): a R8 (caixa nasce em deficit / divida com o cofre) foi REVOGADA — o malote/
// transferencia do cofre e FUNDO DE TROCO (entra como saldo fisico normal, o caixa NAO deve nada).
// A antiga funcao saldoProprioCentavos foi removida junto com o conceito de divida. Ver
// PROJECT_BRAIN/12_DECISAO_FUNDO_SIMPLES.md.
