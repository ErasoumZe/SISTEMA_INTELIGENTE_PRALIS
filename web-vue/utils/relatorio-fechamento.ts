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

// Parada do computador do PDV durante o caixa (registrada pelo operador; o retorno e confirmado depois).
export type ParadaComputador = {
  id: string;
  motivos: string[];
  motivoOutro: string | null;
  iniciadoEm: string;
  retornadoEm: string | null;
  registradoPorNome: string | null;
  retornadoPorNome: string | null;
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
  indisponibilidades: ParadaComputador[];
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

// Leitura de cada forma da maquininha. O LIQUIDO do turno e o que o servidor gravou (`dadosRevisados.liquidos`):
// manha = acumulado desde zero; tarde = acumulado do dia MENOS a leitura da manha. Sem o valor gravado (relatorio
// antigo), calcula final - inicial, tratando a ausencia de `inicial` como zero (e o caso da manha: antes ela
// aparecia como "Nao informado" mesmo com a leitura salva).
export function conferenciaMaquininhaDoRelatorio(relatorioMaquininha: unknown): LinhaMaquininha[] {
  const relatorio = registro(relatorioMaquininha);
  const liquidosGravados = registro(registro(relatorio.dadosRevisados).liquidos);
  return ["credito", "debito", "pix", "voucher"].map((forma) => {
    const inicial = valorOpcional(relatorio[`${forma}Inicial`]);
    const acumulado = valorOpcional(relatorio[`${forma}Final`]);
    const gravado = valorOpcional(liquidosGravados[forma]);
    return {
      forma: forma === "pix" ? "Pix" : `${forma.slice(0, 1).toUpperCase()}${forma.slice(1)}`,
      inicial,
      acumulado,
      liquido: gravado ?? (acumulado === null ? null : acumulado - (inicial ?? 0))
    };
  });
}

// Em qual turno do dia este relatorio foi feito (o servidor decide pela existencia de uma manha ja fechada).
export function etapaDoRelatorioMaquininha(relatorioMaquininha: unknown): "manha" | "tarde" | null {
  const etapa = registro(registro(relatorioMaquininha).dadosRevisados).etapaDia;
  return etapa === "manha" || etapa === "tarde" ? etapa : null;
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

const MOTIVOS_PARADA: Record<string, string> = {
  falta_energia: "Falta de energia na loja",
  oscilacao_eletrica: "Oscilação ou pane elétrica",
  internet_caiu: "Internet caiu",
  cabo_desconectado: "Esbarrão em fio / cabo desconectado",
  computador_travou: "Computador travou, tive que reiniciar",
  limpeza_manutencao: "Limpeza ou manutenção na loja",
  atualizacao_sistema: "Atualização do sistema (Windows)",
  outro: "Outro"
};

// Motivo desconhecido (API nova) aparece como veio, em vez de sumir.
export function rotuloMotivoParada(motivo: string): string {
  return MOTIVOS_PARADA[motivo] ?? motivo;
}

// "12 min", "1h05" ou "Sem retorno registrado" quando o computador ainda esta marcado como desligado.
export function duracaoDaParada(iniciadoEm: string, retornadoEm: string | null): string {
  if (!retornadoEm) return "Sem retorno registrado";
  const minutos = Math.round((Date.parse(retornadoEm) - Date.parse(iniciadoEm)) / 60_000);
  if (!Number.isFinite(minutos) || minutos < 0) return "Duração indisponível";
  if (minutos < 1) return "menos de 1 min";
  if (minutos < 60) return `${minutos} min`;
  return `${Math.floor(minutos / 60)}h${String(minutos % 60).padStart(2, "0")}`;
}
