// Formula oficial de saldo do caixa (ADR-001 — fechamento unico por caixaId).
// Toda a aritmetica acontece em centavos inteiros; conversao para reais so na borda.
export type TotaisCaixaCentavos = {
  /** Vendas pagas em dinheiro físico, apuradas a partir das parcelas da venda. */
  vendasDinheiro: number;
  /** Todas as vendas aprovadas, independentemente da forma de pagamento. */
  entradas: number;
  transferencias: number;
  transferenciasEntrada: number;
  transferenciasSaida: number;
  despesas: number;
  retiradas: number;
  mercadorias: number;
  /** Subtotais informativos das vendas por forma de pagamento (em centavos). */
  porFormaPagamento?: TotaisFormaPagamentoCentavos[];
  /**
   * Informativos para conferir a folha do CREARE (R-225); NAO entram em nenhuma formula de saldo.
   * Troco inicial: o que entrou no PDV pela transferencia de abertura. Sangrias: o que saiu do PDV por
   * sangria/retorno durante o turno (o retorno final so nasce no fechamento).
   */
  trocoInicialEntrada?: number;
  sangriasSaida?: number;
};

export type TotaisFormaPagamentoCentavos = {
  formaPagamentoId: string | null;
  formaPagamento: string;
  total: number;
  quantidade: number;
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

/**
 * Dinheiro que deve existir fisicamente na gaveta.
 *
 * Cartão, Pix, voucher e crediário seguem sendo vendas do turno, mas não são
 * cédulas/moedas do PDV. Eles são conferidos no CREARE e na maquininha; nunca
 * elevam o valor que o operador deve contar no fechamento ou pode entregar ao cofre.
 */
export function saldoFisicoCaixaCentavos(totais: TotaisCaixaCentavos): number {
  return (
    totais.vendasDinheiro +
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
  const operacionalCentavos = totais.vendasDinheiro - totais.despesas - totais.retiradas - totais.mercadorias;
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
  // R-167/R-169 (#152): pagamentos de venda integrada que foram ROTEADOS para esta conta E que ja
  // estao DISPONIVEIS (`disponivel_em` preenchido). Termo separado de `vendas` por dois motivos:
  //
  //   1. a venda integrada nao tem `conta_origem_id` — ela credita pelo PAGAMENTO, nao pela venda,
  //      e cada pagamento pode ir para uma conta diferente;
  //   2. recebivel em aberto (cartao, Pix por evento) fica de FORA deste numero de proposito: ele
  //      existe no financeiro, mas nao e saldo gastavel enquanto a liquidacao nao confirmar.
  //
  // Cada pagamento entra pelo proprio `total_pago`. Nao ha rateio nem arredondamento: a soma dos
  // pagamentos ja foi obrigada a bater com o liquido da venda na ingestao (R-173), entao isto e a
  // MESMA quantia da formula de sempre, apenas distribuida entre as contas.
  vendasRoteadas: number;
  transferenciasEntrada: number;
  // Saidas: transferencias que SAEM dela + os lancamentos pagos por ela.
  transferenciasSaida: number;
  // Parcela informativa das saidas acima que ainda aguarda confirmacao. Nunca entra novamente
  // no disponivel: a saida ja foi descontada quando passou a pendente (R-036).
  transferenciasPendentes?: number;
  // Correcao administrativa imutavel, registrada em ajustes_contas. Nao e venda nem transferencia;
  // existe para que a projecao do saldo possa ser reconciliada sem apagar o historico anterior.
  // Opcional por compatibilidade: consumidores anteriores a ajustes_contas continuam com
  // saldo idêntico até que exista um lançamento administrativo para a conta.
  ajustes?: number;
  despesas: number;
  retiradas: number;
  mercadorias: number;
};

export function saldoContaCentavos(saldoInicialCentavos: number, totais: TotaisContaCentavos): number {
  return (
    saldoInicialCentavos +
    totais.vendas +
    totais.vendasRoteadas +
    totais.transferenciasEntrada +
    (totais.ajustes ?? 0) -
    totais.transferenciasSaida -
    totais.despesas -
    totais.retiradas -
    totais.mercadorias
  );
}

export function saldoPendenteContaCentavos(totais: TotaisContaCentavos): number {
  return totais.transferenciasPendentes ?? 0;
}

// R-183 · `divergente` conta como saida junto com `pendente` e `recebido`: o dinheiro SAIU do caixa
// e nao volta. E o oposto de `cancelada`, que nao conta — foi por isso que cancelar ficou proibido
// como desfecho de divergencia: cancelar faria o valor reaparecer no caixa.
export function transferenciaContaComoSaida(status: string): boolean {
  return status === "pendente" || status === "recebido" || status === "divergente";
}

// R-183 · `divergente` tambem credita o destino — mas pelo valor CONTADO, nao pelo declarado. Quem
// chama e responsavel por usar `valorEntradaCentavos` abaixo; esta funcao responde SE credita, nunca
// QUANTO. Separar as duas perguntas e o que impede o erro de usar um valor so para as duas pontas.
export function transferenciaContaComoEntrada(status: string): boolean {
  return status === "recebido" || status === "divergente";
}

// R-183 · QUANTO entra no destino. `valor_recebido` so existe em `divergente` (o CHECK do banco
// garante), entao o coalesce devolve o comportamento de sempre para todo o resto — inclusive para
// todo o historico, que fica NULL.
//
// A SAIDA nunca passa por aqui: ela e sempre `valor_original`. Usar este numero nas duas pontas
// devolveria a diferenca ao caixa, que e exatamente o que a R-183 proibe.
export function valorEntradaCentavos(movimento: {
  valorOriginalCentavos: number;
  valorRecebidoCentavos: number | null;
}): number {
  return movimento.valorRecebidoCentavos ?? movimento.valorOriginalCentavos;
}
