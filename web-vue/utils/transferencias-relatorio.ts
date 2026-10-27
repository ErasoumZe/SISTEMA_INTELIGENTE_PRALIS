import type { LacreRelatorio, SituacaoMalote } from "@padaria/shared/transferencias";
import type { OperacaoResumo } from "~/types/padaria";

// Regras de APRESENTACAO do relatorio de Transferencias. Nada aqui calcula dinheiro nem decide
// permissao: so traduz o que a API devolveu em rotulo, icone e ordem. Os mapas sao records FECHADOS
// (sem `?? status`): um status novo da API precisa aparecer aqui antes de aparecer na tela.

export type StatusTransferencia = "pendente" | "recebido" | "agendada" | "cancelada" | "divergente";

export const ROTULO_STATUS: Record<StatusTransferencia, { rotulo: string; icone: string }> = {
  pendente: { rotulo: "Pendente", icone: "mdi-clock-outline" },
  recebido: { rotulo: "Recebido", icone: "mdi-check-circle-outline" },
  agendada: { rotulo: "Agendada", icone: "mdi-calendar-clock-outline" },
  cancelada: { rotulo: "Cancelada", icone: "mdi-close-circle-outline" },
  divergente: { rotulo: "Divergente", icone: "mdi-alert-circle-outline" }
};

export const ROTULO_SITUACAO_MALOTE: Record<SituacaoMalote, { rotulo: string; icone: string }> = {
  disponivel: { rotulo: "Disponível", icone: "mdi-lock-open-variant-outline" },
  agendado: { rotulo: "Agendado", icone: "mdi-calendar-clock-outline" },
  usado: { rotulo: "Usado", icone: "mdi-check-circle-outline" },
  recebido_sem_caixa: { rotulo: "Recebido sem abertura de caixa", icone: "mdi-information-outline" },
  divergente: { rotulo: "Divergente", icone: "mdi-alert-circle-outline" },
  cancelado: { rotulo: "Cancelado", icone: "mdi-close-circle-outline" }
};

export type SituacaoDaLinha = {
  chave: string;
  rotulo: string;
  icone: string;
  // So divergencia ganha cor: nao existe token de status de transferencia e a cor nunca e o unico sinal.
  alerta: boolean;
};

function statusConhecido(status: string): status is StatusTransferencia {
  return status in ROTULO_STATUS;
}

/** A situacao UNICA mostrada na linha: do malote quando for malote, senao o status da conferencia. */
export function situacaoDaLinha(op: Pick<OperacaoResumo, "status" | "situacaoMalote">): SituacaoDaLinha {
  if (op.situacaoMalote) {
    const dados = ROTULO_SITUACAO_MALOTE[op.situacaoMalote];
    return { chave: op.situacaoMalote, ...dados, alerta: op.situacaoMalote === "divergente" };
  }
  if (statusConhecido(op.status)) {
    const dados = ROTULO_STATUS[op.status];
    return { chave: op.status, ...dados, alerta: op.status === "divergente" };
  }
  // Status que a tela ainda nao conhece: aparece como veio, sem inventar sentido.
  return { chave: "desconhecido", rotulo: op.status, icone: "mdi-help-circle-outline", alerta: false };
}

/** Nome do movimento: Marco chama de "malote" tanto o que esta disponivel quanto o que ja abriu o caixa. */
export function rotuloMovimento(op: Pick<OperacaoResumo, "tipoMovimento" | "situacaoMalote">): string {
  if (op.situacaoMalote) return "Malote";
  switch (op.tipoMovimento) {
    case "sangria":
      return "Sangria";
    case "retorno":
      return "Retorno / sangria";
    case "abertura":
      return "Malote";
    case "suprimento":
    default:
      return "Transferência";
  }
}

export type ResumoSangrias = { total: number; disponiveis: number; aguardando: number; conferidas: number };

export function resumirSangrias(lacres: LacreRelatorio[]): ResumoSangrias {
  const sangrias = lacres.filter((lacre) => lacre.tipo === "sangria");
  return {
    total: sangrias.length,
    disponiveis: sangrias.filter((lacre) => lacre.situacao === "disponivel").length,
    aguardando: sangrias.filter((lacre) => lacre.situacao === "usada_aguardando_conferencia").length,
    conferidas: sangrias.filter((lacre) => lacre.situacao === "conferida").length
  };
}

function plural(quantidade: number, singular: string, pluralTexto: string) {
  return `${quantidade} ${quantidade === 1 ? singular : pluralTexto}`;
}

/** "3 bolsas · 1 conferida · 1 aguardando · 1 disponível" (so os grupos que existem). */
export function textoSangrias(resumo: ResumoSangrias): string {
  if (resumo.total === 0) return "Sem bolsas";
  const partes = [plural(resumo.total, "bolsa", "bolsas")];
  if (resumo.conferidas) partes.push(plural(resumo.conferidas, "conferida", "conferidas"));
  if (resumo.aguardando) partes.push(`${resumo.aguardando} aguardando`);
  if (resumo.disponiveis) partes.push(plural(resumo.disponiveis, "disponível", "disponíveis"));
  return partes.join(" · ");
}

export const ROTULO_SITUACAO_LACRE: Record<LacreRelatorio["situacao"], string> = {
  disponivel: "Disponível",
  reservado: "Reservado",
  usado: "Usado",
  usada_aguardando_conferencia: "Usada, aguardando conferência",
  conferida: "Conferida"
};

/** Texto lido pelo leitor de tela para um lacre: nunca em branco, mesmo com o numero oculto. */
export function descreverLacre(lacre: LacreRelatorio): string {
  const nome = lacre.tipo === "abertura" ? "Abertura" : lacre.tipo === "fechamento" ? "Fechamento" : "Sangria";
  const numero = lacre.numero ?? "número oculto para o seu perfil";
  return `${nome}, ${numero}, ${ROTULO_SITUACAO_LACRE[lacre.situacao].toLowerCase()}`;
}

export type ComposicaoMalote = { especie: number; moedas: number };

/** `null` quando a composicao nao foi informada: a tela diz "Composição não informada", nunca zero. */
export function composicaoDoMalote(
  op: Pick<OperacaoResumo, "valorEspecieDeclarado" | "valorMoedasDeclarado">
): ComposicaoMalote | null {
  if (op.valorEspecieDeclarado == null || op.valorMoedasDeclarado == null) return null;
  return { especie: op.valorEspecieDeclarado, moedas: op.valorMoedasDeclarado };
}

/** Hora local do lancamento no formato HH:mm (a data vem de `formatarDiaDeTimestamp`). */
export function horaCurta(valor: string | Date | null | undefined): string {
  return valor ? new Date(valor).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "-";
}

// Cor de cada situacao: UMA fonte, usada pelo chip de situacao e pela barra lateral da linha. A cor
// reforca o rotulo (que sempre aparece com icone e palavra); nunca e o unico sinal.
export const COR_SITUACAO: Record<string, string> = {
  pendente: "#e0a100",
  disponivel: "#3b82f6",
  agendado: "#8b5cf6",
  agendada: "#8b5cf6",
  usado: "#22a35a",
  recebido: "#22a35a",
  recebido_sem_caixa: "#14a3a3",
  divergente: "var(--cx-negative)",
  cancelado: "#8a8f98",
  cancelada: "#8a8f98",
  desconhecido: "#8a8f98"
};

export function corDaSituacao(chave: string): string {
  return COR_SITUACAO[chave] ?? COR_SITUACAO.desconhecido!;
}
