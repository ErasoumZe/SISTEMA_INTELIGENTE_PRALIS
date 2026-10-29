/**
 * Como o estado fiscal do produto aparece na tela — o mapa `FISCAL_NA_TELA` do cadastro paralelo.
 *
 * O texto técnico do servidor (`pendente_grupo_invalido`) não serve para quem cadastra. E
 * `quemResolve` existe porque a loja não conserta grupo: dizer "corrija o grupo" sem dizer ONDE
 * seria pedir o impossível.
 */
export interface EstadoFiscalNaTela {
  rotulo: string;
  cor: string;
  icone: string;
  tipo: "success" | "warning" | "info";
  quemResolve?: string;
}

export const FISCAL_NA_TELA: Record<string, EstadoFiscalNaTela> = {
  completo: { rotulo: "completo", cor: "success", icone: "mdi-check-circle", tipo: "success" },
  nao_classificado: { rotulo: "não classificado", cor: "warning", icone: "mdi-clock-outline", tipo: "info" },
  parcial: { rotulo: "parcial", cor: "warning", icone: "mdi-information-outline", tipo: "info" },
  pendente_grupo_invalido: {
    rotulo: "grupo inválido",
    cor: "error",
    icone: "mdi-alert-circle",
    tipo: "warning",
    quemResolve: "O grupo é definido na BASE pelo administrador."
  },
  pendente_sem_correspondencia: {
    rotulo: "sem registro fiscal",
    cor: "warning",
    icone: "mdi-help-circle",
    tipo: "info"
  },
  pendente_ambiguo: {
    rotulo: "ambíguo",
    cor: "error",
    icone: "mdi-help-circle",
    tipo: "warning",
    quemResolve: "Precisa de decisão: há mais de um registro com este nome."
  },
  pendente_conflito: {
    rotulo: "conflito fiscal",
    cor: "error",
    icone: "mdi-alert",
    tipo: "warning",
    quemResolve: "Precisa de decisão do contador."
  },
  pendente_fonte_da_loja: {
    rotulo: "sem cadastro de ECF da loja",
    cor: "warning",
    icone: "mdi-store",
    tipo: "info",
    quemResolve: "A alíquota de ECF vem do Creare de cada loja. Falta o cadastro desta."
  },
  fonte_indisponivel: { rotulo: "fonte fora do ar", cor: "default", icone: "mdi-cloud-off-outline", tipo: "info" }
};

/** Estado da tela; o motivo só aparece quando o fiscal NÃO está completo. Estado desconhecido some. */
export function estadoFiscalNaTela(
  estado: string | null | undefined,
  motivo: string | null | undefined
): (EstadoFiscalNaTela & { motivo: string }) | null {
  if (!estado) return null;
  const visual = FISCAL_NA_TELA[estado];
  if (!visual) return null;
  return { ...visual, motivo: estado === "completo" ? "" : (motivo ?? "") };
}

/** Percentual com vírgula e duas casas, como no resumo do paralelo ("4,00%"). */
export function percentualFiscal(valor: number | null | undefined): string {
  return `${(Number(valor) || 0).toFixed(2).replace(".", ",")}%`;
}

/** Rótulo da fonte da classificação (paralelo: "PLU do código de balança" ou a própria origem). */
export function rotuloDaOrigemFiscal(origemFiscal: string | null | undefined): string {
  return origemFiscal === "plu_balanca" ? "PLU do código de balança" : (origemFiscal ?? "");
}
