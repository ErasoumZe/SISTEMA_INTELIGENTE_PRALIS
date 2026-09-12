// G1/R-171 · por que este fechamento nao pode acontecer agora.
//
// Ate a #101 a trava existia so no servidor e o operador descobria clicando. Aqui ela vira texto
// antes do clique. A regra vive fora do SFC de proposito: dentro do componente ela so seria
// exercitada montando a tela inteira com Vuetify, e uma regra que so o olho testa acaba divergindo
// do servidor. O servidor continua sendo a autoridade — isto e a traducao da recusa dele.
//
// R-185/R-187 · o painel paralelo "Programar entrega ao cofre" continua removido. O planejamento
// atual nasce junto da transferencia inicial, no modal generico, e e executado exclusivamente no
// Caixa. Tanto o planejamento ainda nao executado quanto o retorno em conferencia travam o turno.
//
// R-183 · a entrega em transito tem DOIS estados, e a diferenca e o que o operador pode fazer:
//   - ninguem contou ainda  -> a saida e a conferencia na conta destino;
//   - o destino ja contou e nao encerrou -> a saida e o destino encerrar a divergencia.
// Nos dois casos o fechamento continua travado — o que muda e a quem cobrar. Dizer "aguardando
// conferencia" para uma entrega ja contada mandaria o operador para o lugar errado no fim do turno.
export function motivoFechamentoTravado(entregasPendentes: number, entregasJaContadas = 0): string | null {
  if (entregasPendentes <= 0) return null;
  return entregasJaContadas > 0
    ? "a conta destino já contou uma entrega e ainda não encerrou a divergência."
    : "há transferência de retorno aguardando conferência no destino.";
}
