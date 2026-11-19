import type { EnvioRegistrado, StatusConferencia } from "@padaria/shared/planilha-tesouraria";

// Comum aos dois envios da planilha da Tesouraria (cartoes e folha de caixa).
export const COR_CONFERENCIA: Record<StatusConferencia, string> = {
  CONCILIADO: "success",
  DIVERGENTE: "error",
  "CONFERÊNCIA NECESSÁRIA": "warning"
};

export const dataHoraEnvio = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

export const textoJaEnviado = (envio: EnvioRegistrado) =>
  `Já enviado em ${dataHoraEnvio(envio.enviadoEm)} por ${envio.enviadoPor} (a partir da linha ${envio.linhaInicial}).`;

// "1.059,60" ou "1059,6" (digitado) -> 1059.6. Lixo vira 0, para a soma mostrar na hora que algo esta errado.
export const numeroDigitado = (valor: string) => {
  const convertido = Number(String(valor).replace(/\./gu, "").replace(",", "."));
  return Number.isFinite(convertido) ? Math.round(convertido * 100) / 100 : 0;
};

// Copia editavel da previa. structuredClone recusa o proxy reativo do Vue (DataCloneError); a previa e JSON puro.
export const copiaEditavel = <T>(valor: T): T => JSON.parse(JSON.stringify(valor)) as T;

export const somaCentavos = (valores: number[]) =>
  valores.reduce((soma, valor) => soma + Math.round(valor * 100), 0) / 100;
