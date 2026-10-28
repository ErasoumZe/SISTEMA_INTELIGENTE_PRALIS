import { diaNegocio, instanteNegocio } from "../datas/index.js";

// Folha "Relatorio de Venda Geral" do CREARE/Compilart (cupom termico anexado na etapa Vendas).
// Regras puras usadas pelo servidor (gravacao do relatorio) e pela tela (aviso imediato apos a leitura).

/** R-224: o inicio das vendas pode recuar no maximo isto da abertura oficial. */
export const RECUO_MAXIMO_INICIO_VENDAS_MIN = 60;
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
  return instanteNegocio(`${ano}-${mes}-${dia}`, `${hora}:${minuto}:${segundo}`);
}

export type ConferenciaInicioFolhaCreare = {
  situacao: "pendente" | "ok" | "divergente";
  /** Folha menos inicio das vendas do caixa, em minutos (negativo: a folha comeca antes). */
  diferencaMinutos: number | null;
  /** Hora para o "Ajustar inicio" (minuto cheio, para baixo, para nao perder venda). */
  sugestaoInicio: string | null;
  motivoSemSugestao: "outro_dia" | "alem_do_recuo_maximo" | "depois_da_abertura_oficial" | null;
};

/**
 * R-225 · o "Periodo de" da folha comparado com o inicio das vendas do caixa. Se nao bate, sugere o
 * ajuste do inicio (R-224) quando ele cabe na janela: mesmo dia, ate 60 min antes da abertura OFICIAL e
 * nunca depois dela. O limite do caixa anterior do PDV so o servidor conhece e confere no ajuste.
 */
export function conferirInicioFolhaCreare(entrada: {
  periodoInicio: string | null | undefined;
  inicioVendas: Date | string;
  aberturaOficial: Date | string;
}): ConferenciaInicioFolhaCreare {
  const folha = instanteDaFolhaCreare(entrada.periodoInicio);
  if (!folha) return { situacao: "pendente", diferencaMinutos: null, sugestaoInicio: null, motivoSemSugestao: null };
  const inicio = new Date(entrada.inicioVendas);
  const oficial = new Date(entrada.aberturaOficial);
  const diferencaMs = folha.getTime() - inicio.getTime();
  const diferencaMinutos = Math.round(diferencaMs / MINUTO_MS);
  if (Math.abs(diferencaMs) <= TOLERANCIA_INICIO_FOLHA_CREARE_MIN * MINUTO_MS) {
    return { situacao: "ok", diferencaMinutos, sugestaoInicio: null, motivoSemSugestao: null };
  }
  const sugestao = new Date(Math.floor(folha.getTime() / MINUTO_MS) * MINUTO_MS);
  const semSugestao = (motivo: NonNullable<ConferenciaInicioFolhaCreare["motivoSemSugestao"]>) => ({
    situacao: "divergente" as const,
    diferencaMinutos,
    sugestaoInicio: null,
    motivoSemSugestao: motivo
  });
  if (diaNegocio(sugestao) !== diaNegocio(oficial)) return semSugestao("outro_dia");
  if (sugestao.getTime() > oficial.getTime()) return semSugestao("depois_da_abertura_oficial");
  if (oficial.getTime() - sugestao.getTime() > RECUO_MAXIMO_INICIO_VENDAS_MIN * MINUTO_MS) {
    return semSugestao("alem_do_recuo_maximo");
  }
  return { situacao: "divergente", diferencaMinutos, sugestaoInicio: sugestao.toISOString(), motivoSemSugestao: null };
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
