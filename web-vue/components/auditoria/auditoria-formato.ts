import type { FormaAuditoria } from "@padaria/shared";
import { dinheiro } from "~/utils/domain";

// Formatos da Auditoria de PDVs, usados pelo dia e pela lista de vendas sem caixa.
const formas: Record<string, string> = {
  dinheiro: "Dinheiro",
  credito: "Crédito",
  debito: "Débito",
  pix: "PIX",
  voucher: "Voucher",
  crediario: "Clientes",
  outros: "Outros"
};

export const horaAuditoria = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })
    : "--:--";

export const listaFormasAuditoria = (lista: FormaAuditoria[]) =>
  lista.map((f) => `${formas[f.categoria] ?? f.categoria} ${dinheiro(f.valor)}`).join(" · ");
