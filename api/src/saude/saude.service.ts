import { APP_NAME, type ApiHealth } from "@padaria/shared";
import { pingBancoRepository } from "./saude.repository.js";

/**
 * Tempo limite da ida ao banco no health (G-04 / D-21).
 *
 * 2s é DERIVADO, não escolhido no olho: os três healthchecks do Compose usam `timeout: 5s`. Se o
 * ping demorasse mais que isso, o Docker mataria a sonda antes de nós respondermos — o container
 * ficaria unhealthy do mesmo jeito, mas sem nunca produzir a resposta 503 que explica o motivo, e
 * quem fosse investigar veria só "timeout" sem saber se o problema é a API ou o banco. Respondendo
 * em 2s sobram 3s de folga para a rede e o handshake.
 */
export const TEMPO_LIMITE_BANCO_MS = 2_000;

/**
 * Pergunta ao Postgres se ele está vivo. Devolve `false` em vez de lançar: para o health, "o banco
 * não respondeu" e "o banco respondeu erro" dão no mesmo — os dois viram 503.
 *
 * O tempo limite é uma CORRIDA, e não um `statement_timeout` no pool, porque o caso perigoso não é
 * a consulta lenta: é o host que engole os pacotes sem recusar a conexão, onde o `connect` do TCP
 * fica pendurado por minutos. `statement_timeout` só age depois de haver conexão, então não pegaria
 * justamente esse caso.
 *
 * A consulta que estourou o tempo continua pendente no pool — e tudo bem: quando o banco está nesse
 * estado, o que precisa acontecer é o container ser marcado unhealthy e reiniciado, que é
 * exatamente o que o 503 provoca.
 *
 * `sondar` é injetável só para o teste: é o único jeito de exercitar o ramo "pendurou" sem precisar
 * de um Postgres que engole pacotes.
 */
export async function bancoResponde(
  tempoLimiteMs: number = TEMPO_LIMITE_BANCO_MS,
  sondar: () => Promise<void> = pingBancoRepository
): Promise<boolean> {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, rejeitar) => {
    temporizador = setTimeout(() => rejeitar(new Error("tempo limite do banco no health")), tempoLimiteMs);
  });

  try {
    await Promise.race([sondar(), limite]);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(temporizador);
  }
}

export function obterSaude(): ApiHealth & { app: string } {
  return {
    status: "ok",
    service: "api",
    app: APP_NAME,
    banco: "ok"
  };
}
