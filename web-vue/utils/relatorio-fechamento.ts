import type { LinhaHistoricoCaixa } from "@padaria/shared";
import { formatarDataHora } from "~/utils/formatacao";

// Tipos e funcoes puras do Relatorio de fechamento (Tesouraria). Ficam fora dos componentes para serem testadas
// sem montar tela e para as pecas da tela (lista, cartao, popup do fechamento) falarem a mesma lingua.

export type Situacao =
  | "aberto"
  | "em_fechamento"
  | "aguardando_tesouraria"
  | "fechado_sem_pendencias"
  | "com_quebra"
  | "conferido_tesouraria"
  | "divergencia_confirmada_tesouraria";

export type LinhaRelatorio = LinhaHistoricoCaixa & { situacaoTesouraria: Situacao };

export type Registro = Record<string, unknown>;

export type Anexo = {
  id: string;
  tipo: string;
  nomeOriginal: string;
  mimeType: string;
  tamanhoBytes: number;
  criadoEm: string | null;
};

export type DecisaoTesouraria = {
  id: string;
  resultado: "conferido" | "divergente";
  observacao: string | null;
  conferidoPor: string;
  conferidoPorNome: string | null;
  conferidoEm: string | null;
};

export type Dossie = {
  caixa: Registro;
  resumo: Registro | null;
  situacaoTesouraria: Situacao;
  transferencias: Registro[];
  conferencias: Registro[];
  conferenciasTesouraria: DecisaoTesouraria[];
  quebras: Registro[];
  relatorioVendas: Registro | null;
  relatorioMaquininha: Registro | null;
  anexos: Anexo[];
  lancamentos: Record<string, Registro[]>;
  vendasCanceladas: Registro[];
  ajuste: Registro | null;
};

export type LinhaMaquininha = {
  forma: string;
  inicial: number | null;
  acumulado: number | null;
  liquido: number | null;
};

const COR_SITUACAO: Record<Situacao, string> = {
  aberto: "info",
  em_fechamento: "warning",
  aguardando_tesouraria: "deep-orange",
  fechado_sem_pendencias: "success",
  com_quebra: "error",
  conferido_tesouraria: "success",
  divergencia_confirmada_tesouraria: "deep-orange"
};

const TEXTO_SITUACAO: Record<Situacao, string> = {
  aberto: "Aberto",
  em_fechamento: "Em fechamento",
  aguardando_tesouraria: "Aguardando Tesouraria",
  fechado_sem_pendencias: "Fechado sem pendências",
  com_quebra: "Com quebra",
  conferido_tesouraria: "Conferido pela Tesouraria",
  divergencia_confirmada_tesouraria: "Divergência confirmada pela Tesouraria"
};

// Situacao desconhecida (API nova, dado antigo) nunca quebra a tela: cai em cor neutra e texto generico.
export function corDaSituacao(situacao: unknown): string {
  return typeof situacao === "string" ? (COR_SITUACAO[situacao as Situacao] ?? "secondary") : "secondary";
}
export function textoDaSituacao(situacao: unknown): string {
  return typeof situacao === "string"
    ? (TEXTO_SITUACAO[situacao as Situacao] ?? "Status não informado")
    : "Status não informado";
}

export function numero(valor: unknown): number {
  return typeof valor === "number" ? valor : Number(valor ?? 0);
}
export function valorOpcional(valor: unknown): number | null {
  return valor === null || valor === undefined || valor === "" ? null : numero(valor);
}
export function texto(valor: unknown): string {
  return typeof valor === "string" && valor ? valor : "--";
}
export function dataHoraOuTraco(valor: unknown): string {
  if (typeof valor === "string" && valor) return formatarDataHora(valor);
  return valor instanceof Date ? formatarDataHora(valor) : "--";
}
export function registro(valor: unknown): Registro {
  return valor && typeof valor === "object" && !Array.isArray(valor) ? (valor as Registro) : {};
}

// Leitura de cada forma da maquininha (inicial x final do turno); `liquido` so existe quando os dois lados existem.
export function conferenciaMaquininhaDoRelatorio(relatorioMaquininha: unknown): LinhaMaquininha[] {
  const relatorio = registro(relatorioMaquininha);
  return ["credito", "debito", "pix", "voucher"].map((forma) => {
    const inicial = valorOpcional(relatorio[`${forma}Inicial`]);
    const acumulado = valorOpcional(relatorio[`${forma}Final`]);
    return {
      forma: forma === "pix" ? "Pix" : `${forma.slice(0, 1).toUpperCase()}${forma.slice(1)}`,
      inicial,
      acumulado,
      liquido: inicial === null || acumulado === null ? null : acumulado - inicial
    };
  });
}

// A fila da Tesouraria: o que ainda precisa de conferencia, o que ja foi decidido e o que ainda esta em operacao.
export function separarPorSituacao(linhas: LinhaRelatorio[]) {
  const paraConferir = linhas.filter((linha) =>
    ["aguardando_tesouraria", "fechado_sem_pendencias", "com_quebra"].includes(linha.situacaoTesouraria)
  );
  const historico = linhas.filter((linha) =>
    ["conferido_tesouraria", "divergencia_confirmada_tesouraria"].includes(linha.situacaoTesouraria)
  );
  const emOperacao = linhas.filter((linha) => !paraConferir.includes(linha) && !historico.includes(linha));
  return { paraConferir, historico, emOperacao };
}
