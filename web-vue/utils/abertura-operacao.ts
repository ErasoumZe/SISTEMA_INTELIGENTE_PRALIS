export function criarGuardaAberturaOperacao() {
  let aberturaEmAndamento = false;

  return async function abrirUmaVez<T>(modalJaAberto: () => boolean, abrir: () => Promise<T>): Promise<T | undefined> {
    if (aberturaEmAndamento || modalJaAberto()) return undefined;

    aberturaEmAndamento = true;
    try {
      return await abrir();
    } finally {
      aberturaEmAndamento = false;
    }
  };
}
