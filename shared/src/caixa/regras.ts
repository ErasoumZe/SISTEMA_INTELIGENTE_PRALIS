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

// "Saldo proprio" do caixa sob a otica da divida do malote (R8). NAO altera a formula canonica acima
// (ADR-001 intacto); e um valor DERIVADO para o cockpit.
//
// E o resultado OPERACIONAL em dinheiro menos a divida do malote, exatamente a R8:
// "vendas_dinheiro - despesas_pagas_em_dinheiro - divida_do_malote". A base operacional EXCLUI todas
// as transferencias (abertura/suprimento/sangria/retorno = gestao de dinheiro cofre<->caixa<->banco,
// nao resultado). Isso e o que impede o duplo desconto no M2: uma sangria/retorno so MOVE dinheiro
// (entra em transferenciasSaida) e nao pode mexer no rastreador de deficit.
//   - abertura (malote 490, sem vendas):       0 - 490 = -490  (nasce em deficit)
//   - apos 490 em vendas dinheiro:           490 - 490 =    0  (divida quitada)
//   - 490 em vendas + sangria de 200:        490 - 490 =    0  (a sangria NAO desconta de novo)
//   - excedente vira resultado do caixa (> 0).
// Sem malote (dividaCofre = 0) e sem transferencias, saldoProprio == saldoFisico (retrocompativel).
export function saldoProprioCentavos(totais: TotaisCaixaCentavos, dividaCofreCentavos: number): number {
  const operacionalCentavos = totais.entradas - totais.despesas - totais.retiradas - totais.mercadorias;
  return operacionalCentavos - dividaCofreCentavos;
}
