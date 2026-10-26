import type { JsonValue } from "@padaria/shared/api";

export type FonteCentral =
  | "sia_li"
  | "compilart_tnp"
  | "planilha_tnp"
  | "fiscal_tnp"
  | "planilha_nova"
  | "vendidos_tnp";
export type LojaCentral = "" | "LI" | "TNP" | "BASE" | "HORA";

export type CargaCentral = {
  id: string;
  estado: string;
  criadoEm: string;
  resumo: Record<string, JsonValue> | null;
};

export type ItemFonteCentral = {
  fonte: FonteCentral;
  loja: string;
  codigoInterno: string;
  codigoBarras: string;
  nome: string;
  custo: string | null;
  venda: string | null;
  fiscal: Record<string, string | null> | null;
};

export type GrupoCentral = {
  id: string;
  chave: string;
  motivo: string;
  nome: string;
  lojas: string[];
  fontes: FonteCentral[];
  alertaNomeDivergente: boolean;
  alertaBarrasConflitantes: boolean;
  alertaSemFiscalTnp: boolean;
  alertaSemGrupo: boolean;
  alertaJaNaBase: boolean;
  decisao: { acao: string } | null;
  itens: ItemFonteCentral[];
};

export type ResumoCargaCentral = {
  linhas: number;
  grupos: number;
  barrasConflitantes: number;
  nomesDivergentes: number;
  semFiscalTnp: number;
  semGrupo: number;
};
