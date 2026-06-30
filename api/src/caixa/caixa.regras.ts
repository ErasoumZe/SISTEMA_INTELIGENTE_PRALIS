import { deCentavos, paraCentavos } from "@padaria/shared/dinheiro";

export function saldoCaixa(params: {
  totalEntradas: number;
  totalTransferencias: number;
  totalDespesas: number;
  totalRetiradas: number;
}): number {
  return deCentavos(
    paraCentavos(params.totalEntradas) -
      paraCentavos(params.totalTransferencias) -
      paraCentavos(params.totalDespesas) -
      paraCentavos(params.totalRetiradas)
  );
}
