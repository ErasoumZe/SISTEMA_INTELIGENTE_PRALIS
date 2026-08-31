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
export function motivoFechamentoTravado(entregasPendentes: number, solicitacoesAgendadas: number): string | null {
  const emTransito = entregasPendentes > 0;
  const programadas = solicitacoesAgendadas > 0;
  if (emTransito && programadas) {
    return "há entrega aguardando conferência no cofre e ordem da Tesouraria ainda não executada.";
  }
  if (emTransito) return "há entrega aguardando conferência no cofre.";
  if (programadas) return "há ordem da Tesouraria ainda não executada — execute ou peça o cancelamento.";
  return null;
}
