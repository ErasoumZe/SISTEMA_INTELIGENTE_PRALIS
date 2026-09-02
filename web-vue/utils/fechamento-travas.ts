// G1/R-171 · por que este fechamento nao pode acontecer agora.
//
// Sao DUAS travas, opostas entre si, e ate a #101 nenhuma delas aparecia no botao:
//   - entrega `pendente`  — o dinheiro JA SAIU e o cofre ainda nao conferiu;
//   - solicitacao `agendada` — a ordem da Tesouraria ainda NAO virou dinheiro na rua (decisao 5).
//
// A regra vive aqui, fora do SFC, pelo mesmo motivo de `utils/solicitacoes-cofre.ts`: dentro do
// componente ela so seria exercitada montando a tela inteira com Vuetify, e uma regra que so o
// olho testa acaba divergindo do servidor. O servidor continua sendo a autoridade — isto e a
// tradução da recusa dele para o operador, antes do clique.
// R-183 · a entrega em transito tem DOIS estados, e a diferenca e o que o operador pode fazer:
//   - ninguem contou ainda  -> a saida e a conferencia no cofre;
//   - o cofre ja contou e nao encerrou -> a saida e o cofre encerrar a divergencia.
// Nos dois casos o fechamento continua travado — o que muda e a quem cobrar. Dizer "aguardando
// conferencia" para uma entrega ja contada mandaria o operador para o lugar errado no fim do turno.
export function motivoFechamentoTravado(
  entregasPendentes: number,
  solicitacoesAgendadas: number,
  entregasJaContadas = 0
): string | null {
  const emTransito = entregasPendentes > 0;
  const programadas = solicitacoesAgendadas > 0;
  const contadas = entregasJaContadas > 0;
  const transito = contadas
    ? "o cofre já contou uma entrega e ainda não encerrou a divergência"
    : "há entrega aguardando conferência no cofre";
  if (emTransito && programadas) {
    return `${transito} e ordem da Tesouraria ainda não executada.`;
  }
  if (emTransito) return `${transito}.`;
  if (programadas) return "há ordem da Tesouraria ainda não executada — execute ou peça o cancelamento.";
  return null;
}
