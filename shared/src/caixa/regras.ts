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

// "Saldo proprio" do caixa sob a otica da divida do malote (R8 — Opcao A/Lente B). NAO altera a
// formula canonica acima (ADR-001 intacto); e um valor DERIVADO para o cockpit.
//
// O caixa nasce DEVENDO ao cofre o valor do malote. A transferencia de abertura (cofre -> caixa) ja
// entra no saldo fisico como transferenciasEntrada — o dinheiro emprestado esta fisicamente na
// gaveta. O saldo proprio remove esse fundo emprestado (uma vez, como caixa na gaveta) e desconta a
// divida ainda em aberto, de modo que:
//   - abertura (malote 490, sem vendas): 0 - 2*490 + 490(transf) = -490  (nasce em deficit)
//   - apos 490 em vendas dinheiro:       490 - 980 + 490          =    0  (divida quitada)
//   - excedente vira resultado do caixa (> 0).
// Sem malote, dividaCofre = 0 e saldoProprio == saldoFisico (retrocompativel).
export function saldoProprioCentavos(totais: TotaisCaixaCentavos, dividaCofreCentavos: number): number {
  const operacionalCentavos = saldoCaixaCentavos(totais) - dividaCofreCentavos; // remove o fundo emprestado
  return operacionalCentavos - dividaCofreCentavos; // desconta a divida ainda em aberto
}
