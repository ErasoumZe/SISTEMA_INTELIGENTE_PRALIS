// G1/R-171 · por que este fechamento nao pode acontecer agora.
//
// Ate a #101 a trava existia so no servidor e o operador descobria clicando. Aqui ela vira texto
// antes do clique. A regra vive fora do SFC de proposito: dentro do componente ela so seria
// exercitada montando a tela inteira com Vuetify, e uma regra que so o olho testa acaba divergindo
// do servidor. O servidor continua sendo a autoridade — isto e a traducao da recusa dele.
//
// R-179/Fatia 3 · havia uma SEGUNDA trava aqui, a da ordem `agendada` que a Tesouraria programava
// pelo painel "Programar entrega ao cofre" (D12). O painel e as rotas dele foram removidos: existe
// um unico caminho para levar dinheiro do Caixa ao Cofre, e ele nasce dentro do turno. Sem produtor
// de ordem, a segunda trava deixou de existir — e nao vira `if` morto esperando ser reativado.
//
// R-183 · a entrega em transito tem DOIS estados, e a diferenca e o que o operador pode fazer:
//   - ninguem contou ainda  -> a saida e a conferencia no cofre;
//   - o cofre ja contou e nao encerrou -> a saida e o cofre encerrar a divergencia.
// Nos dois casos o fechamento continua travado — o que muda e a quem cobrar. Dizer "aguardando
// conferencia" para uma entrega ja contada mandaria o operador para o lugar errado no fim do turno.
export function motivoFechamentoTravado(entregasPendentes: number, entregasJaContadas = 0): string | null {
  if (entregasPendentes <= 0) return null;
  return entregasJaContadas > 0
    ? "o cofre já contou uma entrega e ainda não encerrou a divergência."
    : "há entrega aguardando conferência no cofre.";
}
