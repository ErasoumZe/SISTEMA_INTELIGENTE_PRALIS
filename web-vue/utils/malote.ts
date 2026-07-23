// Malote === lacre (D3): mapeamento do status do malote para o chip da lista (cor + rotulo).
// Cores dos tokens V1: disponivel = verde (positivo), em_uso = laranja (cat-transferencias),
// devolvido = cinza (ink-soft). Ciclo: disponivel -> em_uso -> devolvido.
export type ChipStatusMalote = { cor: string; label: string };

const CHIP_STATUS_MALOTE: Record<string, ChipStatusMalote> = {
  disponivel: { cor: "#16a34a", label: "disponível" },
  em_uso: { cor: "#c2410c", label: "em uso" },
  devolvido: { cor: "#64748b", label: "devolvido" }
};

export function chipStatusMalote(status: string | undefined): ChipStatusMalote | undefined {
  return status ? CHIP_STATUS_MALOTE[status] : undefined;
}
