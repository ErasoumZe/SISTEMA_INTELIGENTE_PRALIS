import { diaNegocio, instanteNegocio } from "../datas/index.js";

// Folha "Relatorio de Venda Geral" do CREARE/Compilart (cupom termico anexado na etapa Vendas).
// Regras puras usadas pelo servidor (gravacao do relatorio) e pela tela (aviso imediato apos a leitura).

/** Diferenca aceita entre o "Periodo de" da folha e o inicio das vendas do caixa (R-225). */
export const TOLERANCIA_INICIO_FOLHA_CREARE_MIN = 2;
/** A emissao da folha "bate" com o corte se for de 2 min antes ate 15 min depois dele (R-225). */
export const JANELA_EMISSAO_FOLHA_CREARE_MIN = { antes: 2, depois: 15 } as const;

const DATA_HORA_FOLHA = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/u;
const MINUTO_MS = 60_000;

/**
 * A folha imprime "26/10/2026 - 13:58:46" na emissao e "26/10/2026 06:14:58" no periodo. Normaliza para
 * "DD/MM/AAAA HH:MM:SS"; qualquer outra coisa vira null (o campo fica pendente, nunca chutado).
 */
export function normalizarDataHoraFolhaCreare(valor: string | null | undefined): string | null {
  if (typeof valor !== "string") return null;
  const texto = valor
    .replace(/\s*-\s*(?=\d{2}:)/u, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return DATA_HORA_FOLHA.test(texto) ? texto : null;
}

/** A folha nao traz fuso: a hora impressa e sempre a hora local da loja (America/Sao_Paulo). */
export function instanteDaFolhaCreare(texto: string | null | undefined): Date | null {
  const normalizado = normalizarDataHoraFolhaCreare(texto);
  const partes = normalizado?.match(DATA_HORA_FOLHA);
  if (!partes) return null;
  const [, dia, mes, ano, hora, minuto, segundo] = partes;
  if (Number(mes) < 1 || Number(mes) > 12 || Number(dia) < 1 || Number(dia) > 31) return null;
  if (Number(hora) > 23 || Number(minuto) > 59 || Number(segundo) > 59) return null;
  const instante = instanteNegocio(`${ano}-${mes}-${dia}`, `${hora}:${minuto}:${segundo}`);
  return diaNegocio(instante) === `${ano}-${mes}-${dia}` ? instante : null;
}

export type ConferenciaInicioFolhaCreare = {
  situacao: "pendente" | "ok" | "divergente";
  /** Folha menos inicio das vendas do caixa, em minutos (negativo: a folha comeca antes). */
  diferencaMinutos: number | null;
};

/**
 * R-225 · o "Periodo de" da folha comparado com o inicio das vendas do caixa (tolerancia de 2 min). Desde a
 * R-244 o servidor ja alinha o periodo a folha ao gerar o relatorio; "divergente" sobra so quando o
 * alinhamento nao pode ser aplicado (ver `alinharPeriodoAFolhaCreare`).
 */
export function conferirInicioFolhaCreare(entrada: {
  periodoInicio: string | null | undefined;
  inicioVendas: Date | string;
}): ConferenciaInicioFolhaCreare {
  const folha = instanteDaFolhaCreare(entrada.periodoInicio);
  if (!folha) return { situacao: "pendente", diferencaMinutos: null };
  const diferencaMs = folha.getTime() - new Date(entrada.inicioVendas).getTime();
  const diferencaMinutos = Math.round(diferencaMs / MINUTO_MS);
  const bate = Math.abs(diferencaMs) <= TOLERANCIA_INICIO_FOLHA_CREARE_MIN * MINUTO_MS;
  return { situacao: bate ? "ok" : "divergente", diferencaMinutos };
}

/** Por que um lado do periodo nao foi alinhado a folha (R-244). */
export type MotivoSemAlinhamentoFolhaCreare =
  | "sem_horario"
  | "outro_dia"
  | "no_futuro"
  | "antes_do_caixa_anterior"
  | "depois_do_proximo_caixa"
  | "fim_antes_do_inicio";

export type LadoAlinhamentoFolhaCreare = {
  antes: string;
  depois: string;
  /** true: o lado passou a ser o horario da folha. */
  daFolha: boolean;
  motivo: MotivoSemAlinhamentoFolhaCreare | null;
};

export type AlinhamentoPeriodoFolhaCreare = {
  inicio: LadoAlinhamentoFolhaCreare;
  fim: LadoAlinhamentoFolhaCreare;
};

/**
 * R-244 · ao gerar o relatorio de vendas do fechamento, o periodo do caixa passa a ser o da folha do CREARE:
 * inicio = "Periodo de", fim = "Data da emissao" (mesmo que o caixa do sistema tenha aberto depois ou o corte
 * tenha sido antes/depois). Cada lado so e aplicado se for seguro:
 * - a hora existe na leitura e e do mesmo dia de negocio da abertura oficial;
 * - nao esta no futuro;
 * - o inicio fica DEPOIS do fim do caixa anterior do mesmo PDV (a venda daquele instante casaria com os dois);
 * - o fim fica ANTES do inicio do proximo caixa do mesmo PDV;
 * - o fim fica depois do inicio.
 * O lado que nao passa fica como estava e leva o motivo (a tela e o dossie mostram).
 */
export function alinharPeriodoAFolhaCreare(entrada: {
  periodoInicio: string | null | undefined;
  dataEmissao: string | null | undefined;
  aberturaOficial: Date | string;
  inicioAtual: Date | string;
  fimAtual: Date | string;
  fimCaixaAnterior: Date | string | null;
  inicioProximoCaixa: Date | string | null;
  agora: Date;
}): AlinhamentoPeriodoFolhaCreare {
  const dia = diaNegocio(entrada.aberturaOficial);
  const inicioAtual = new Date(entrada.inicioAtual);
  const fimAtual = new Date(entrada.fimAtual);
  const anterior = entrada.fimCaixaAnterior ? new Date(entrada.fimCaixaAnterior) : null;
  const proximo = entrada.inicioProximoCaixa ? new Date(entrada.inicioProximoCaixa) : null;

  const motivoComum = (instante: Date | null): MotivoSemAlinhamentoFolhaCreare | null => {
    if (!instante) return "sem_horario";
    if (diaNegocio(instante) !== dia) return "outro_dia";
    if (instante.getTime() > entrada.agora.getTime()) return "no_futuro";
    return null;
  };

  const folhaInicio = instanteDaFolhaCreare(entrada.periodoInicio);
  const folhaFim = instanteDaFolhaCreare(entrada.dataEmissao);

  let motivoInicio = motivoComum(folhaInicio);
  if (!motivoInicio && anterior && folhaInicio && folhaInicio.getTime() <= anterior.getTime()) {
    motivoInicio = "antes_do_caixa_anterior";
  }
  let inicio = !motivoInicio && folhaInicio ? folhaInicio : inicioAtual;

  let motivoFim = motivoComum(folhaFim);
  if (!motivoFim && proximo && folhaFim && folhaFim.getTime() >= proximo.getTime()) {
    motivoFim = "depois_do_proximo_caixa";
  }
  if (!motivoFim && folhaFim && folhaFim.getTime() <= inicio.getTime()) motivoFim = "fim_antes_do_inicio";
  const fim = !motivoFim && folhaFim ? folhaFim : fimAtual;

  // Fim mantido e inicio da folha depois dele: o periodo ficaria invertido, entao o inicio tambem fica.
  if (!motivoInicio && inicio.getTime() >= fim.getTime()) {
    motivoInicio = "fim_antes_do_inicio";
    inicio = inicioAtual;
  }

  return {
    inicio: {
      antes: inicioAtual.toISOString(),
      depois: inicio.toISOString(),
      daFolha: !motivoInicio,
      motivo: motivoInicio
    },
    fim: { antes: fimAtual.toISOString(), depois: fim.toISOString(), daFolha: !motivoFim, motivo: motivoFim }
  };
}

export type ConferenciaEmissaoFolhaCreare = {
  situacao: "pendente" | "ok" | "antes_do_corte" | "depois_do_corte";
  /** Emissao menos o corte do fechamento, em minutos. */
  diferencaMinutos: number | null;
};

/** R-225 · informativo: a folha impressa muito antes do corte nao tem as ultimas vendas do turno. */
export function conferirEmissaoFolhaCreare(entrada: {
  dataEmissao: string | null | undefined;
  corte: Date | string | null | undefined;
}): ConferenciaEmissaoFolhaCreare {
  const emissao = instanteDaFolhaCreare(entrada.dataEmissao);
  if (!emissao || !entrada.corte) return { situacao: "pendente", diferencaMinutos: null };
  const diferencaMs = emissao.getTime() - new Date(entrada.corte).getTime();
  const diferencaMinutos = Math.round(diferencaMs / MINUTO_MS);
  if (diferencaMs < -JANELA_EMISSAO_FOLHA_CREARE_MIN.antes * MINUTO_MS) {
    return { situacao: "antes_do_corte", diferencaMinutos };
  }
  if (diferencaMs > JANELA_EMISSAO_FOLHA_CREARE_MIN.depois * MINUTO_MS) {
    return { situacao: "depois_do_corte", diferencaMinutos };
  }
  return { situacao: "ok", diferencaMinutos };
}
