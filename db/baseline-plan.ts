export type EntradaDoJournal = { idx: number; when: number; tag: string };

export type MigrationSelecionada = EntradaDoJournal & { hash: string };

export function lerLimiteThrough(argumentos: string[]): string | null {
  const argumento = argumentos.find((item) => item.startsWith("--through="));
  if (!argumento) return null;

  const limite = argumento.slice("--through=".length);
  if (!/^\d{4}$/u.test(limite)) {
    throw new Error("[baseline] --through deve usar o formato YYYY, por exemplo --through=0061");
  }
  return limite;
}

export function selecionarMigrations(
  entradas: EntradaDoJournal[],
  limiteInformado: string | null
): MigrationSelecionada[] {
  if (entradas.length === 0) throw new Error("[baseline] journal sem migrations");

  const indiceLimite = limiteInformado
    ? entradas.findIndex((entrada) => entrada.tag.slice(0, 4) === limiteInformado)
    : entradas.length - 1;

  if (indiceLimite < 0) {
    throw new Error(`[baseline] limite ${limiteInformado} nao existe no journal`);
  }

  return entradas.slice(0, indiceLimite + 1).map((entrada) => ({ ...entrada, hash: "" }));
}

export function validarEntradasDoJournal(entradas: EntradaDoJournal[]): void {
  entradas.forEach((entrada, indice) => {
    if (entrada.idx !== indice) {
      throw new Error(`[baseline] journal fora de ordem no indice ${entrada.idx}; esperado ${indice}`);
    }
    if (!/^\d{4}_/u.test(entrada.tag)) {
      throw new Error(`[baseline] tag invalida no journal: ${entrada.tag}`);
    }
  });
}

export function validarHistoricoVazio(total: number): void {
  if (total > 0) {
    throw new Error("[baseline] historico existente incompatível com baseline");
  }
}
