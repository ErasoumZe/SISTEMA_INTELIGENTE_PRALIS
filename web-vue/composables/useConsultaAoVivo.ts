/**
 * Consulta "ao vivo" enquanto a pessoa digita: espera uma pausa (debounce) e descarta a resposta que
 * chega ATRASADA — se a pessoa trocou o grupo duas vezes, vale a resposta da ultima troca, nunca a da
 * primeira que voltou por ultimo (o paralelo faz o mesmo com um contador de requisicao).
 *
 * Falha da consulta nunca e erro de tela: e conveniencia, e o cadastro segue (resultado volta a `null`).
 */
export function useConsultaAoVivo<Entrada, Resultado>(
  consultar: (entrada: Entrada) => Promise<Resultado>,
  atrasoMs: number
) {
  const resultado = ref<Resultado | null>(null) as Ref<Resultado | null>;
  const carregando = ref(false);
  let pedido = 0;
  let espera: ReturnType<typeof setTimeout> | null = null;

  /** Executa a consulta `numero`; so a mais recente escreve o resultado. */
  async function executar(entrada: Entrada, numero: number) {
    try {
      const resposta = await consultar(entrada);
      if (numero === pedido) resultado.value = resposta;
    } catch {
      if (numero === pedido) resultado.value = null;
    } finally {
      if (numero === pedido) carregando.value = false;
    }
  }

  /** Agenda a consulta; `null` limpa o resultado e cancela o que estava pendente. */
  function agendar(entrada: Entrada | null) {
    if (espera) clearTimeout(espera);
    const numero = ++pedido;
    resultado.value = null;
    if (entrada === null) {
      carregando.value = false;
      return;
    }
    carregando.value = true;
    espera = setTimeout(() => void executar(entrada, numero), atrasoMs);
  }

  onScopeDispose(() => {
    if (espera) clearTimeout(espera);
    pedido += 1;
  });

  return { resultado, carregando, agendar };
}
