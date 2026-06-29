export function saldoCaixa(params: {
  totalEntradas: number;
  totalTransferencias: number;
  totalDespesas: number;
  totalRetiradas: number;
}): number {
  return Number(
    (params.totalEntradas - params.totalTransferencias - params.totalDespesas - params.totalRetiradas).toFixed(2)
  );
}
