export type TotaisRelatorioVendas = {
  totalGeral?: number;
  // Compatibilidade de leitura: relatórios gerados antes de 06/10/2026 persistiam este nome.
  total?: number;
  quantidade: number;
  porFormaPagamento: Array<{
    formaPagamento: string;
    categoriaFechamentoCaixa: "dinheiro" | "credito" | "debito" | "pix" | "voucher" | "crediario" | "outros" | null;
    total: number;
    quantidade: number;
  }>;
};

export type TotaisRelatorioVendasNormalizado = Omit<TotaisRelatorioVendas, "totalGeral"> & { totalGeral: number };

export function normalizarTotaisRelatorioVendas(totais: TotaisRelatorioVendas): TotaisRelatorioVendasNormalizado {
  return {
    ...totais,
    totalGeral: typeof totais.totalGeral === "number" ? totais.totalGeral : (totais.total ?? 0)
  };
}
