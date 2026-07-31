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

// --- Saldo da CONTA (PROJECT_BRAIN/17, D8) ---------------------------------------------------
// "saldo da conta = fundo + entradas - saidas (derivado dos movimentos — nao sobrescrever a coluna
// do fundo; o fundo e o ponto de partida)."
//
// Mora aqui, colado no saldo do CAIXA, porque as duas contam a mesma coisa e precisam continuar
// contando igual. As convencoes sao as MESMAS do saldoCaixaCentavos (ADR-001), por decisao do Jose
// em 30/07 — duas formulas de dinheiro com filtros diferentes viram divergencia entre a tela do
// caixa e a da conta que ninguem consegue explicar depois:
//   - conta o movimento quando `computar = true` E `status <> 'cancelado'` (logo, mercadoria de
//     NF-e em 'aguardando_aprovacao' JA pesa — o dinheiro vai sair);
//   - a VENDA entra pelo liquido (original - desconto + acrescimo); os demais entram por
//     valor_original puro.
// Quem monta os totais e o repositorio; aqui e so a aritmetica, em centavos inteiros.
//
// Exemplo do Jose (PROJECT_BRAIN/15): cofre com fundo 10.000, transferencia de 500 para o caixa 1
// -> o cofre exibe 9.500 e o caixa 1 recebe +500. Nenhuma linha do cadastro do cofre foi alterada.
export type TotaisContaCentavos = {
  // Entradas: vendas com esta conta + transferencias que CHEGAM nela.
  vendas: number;
  transferenciasEntrada: number;
  // Saidas: transferencias que SAEM dela + os lancamentos pagos por ela.
  transferenciasSaida: number;
  // Parcela informativa das saidas acima que ainda aguarda confirmacao. Nunca entra novamente
  // no disponivel: a saida ja foi descontada quando passou a pendente (R-036).
  transferenciasPendentes?: number;
  despesas: number;
  retiradas: number;
  mercadorias: number;
};

export function saldoContaCentavos(saldoInicialCentavos: number, totais: TotaisContaCentavos): number {
  return (
    saldoInicialCentavos +
    totais.vendas +
    totais.transferenciasEntrada -
    totais.transferenciasSaida -
    totais.despesas -
    totais.retiradas -
    totais.mercadorias
  );
}

export function saldoPendenteContaCentavos(totais: TotaisContaCentavos): number {
  return totais.transferenciasPendentes ?? 0;
}

export function transferenciaContaComoSaida(status: string): boolean {
  return status === "pendente" || status === "recebido";
}

export function transferenciaContaComoEntrada(status: string): boolean {
  return status === "recebido";
}
