import type { Permissao, TipoMovimentacao } from "@padaria/shared";

export const permissaoPorTipoMovimentacao: Record<TipoMovimentacao, Permissao> = {
  entrada: "entradas",
  despesa: "despesas",
  transferencia: "transferencias",
  mercadoria: "mercadorias",
  retirada: "retiradas"
};

export function deveComputarMercadoria(temNotaFiscal: boolean, computarInformado: boolean): boolean {
  return temNotaFiscal ? true : computarInformado;
}

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
