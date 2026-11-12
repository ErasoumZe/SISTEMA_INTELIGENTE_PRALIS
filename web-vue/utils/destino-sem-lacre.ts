// R-238 · como o gerente reconhece o PDV de destino da transferencia sem lacre: posto, turno e quem abriu o caixa.
import type { DestinoSemLacre } from "@padaria/shared/transferencias";

const TURNO = { manha: "Manhã", tarde: "Tarde" } as const;

export function rotuloDestinoSemLacre(destino: DestinoSemLacre): string {
  return [destino.pdvNome, destino.turno ? TURNO[destino.turno] : null, destino.responsavelNome?.trim() || null]
    .filter(Boolean)
    .join(" · ");
}
