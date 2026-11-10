import { env } from "../env.js";

// Envio pelo WhatsApp (doc 57 §3, R-235): o sistema manda a cotação ao fornecedor, ninguém copia link. Provedor
// escolhido por variável de ambiente; sem configuração, nada sai e a fila espera (a tela avisa).

export type MensagemWhatsapp = {
  /** Só dígitos, com DDI (55...). */
  telefone: string;
  tipo: "convite" | "pedido_confirmado";
  /** Texto pronto, enviado como está (Evolution ou gateway por webhook). */
  texto: string;
};

export type ResultadoEnvio = { ok: true; idExterno: string | null } | { ok: false; erro: string };

/** Só dígitos; telefone brasileiro sem DDI ganha o 55. */
export function telefoneParaWhatsapp(valor: string): string {
  const digitos = valor.replace(/\D/g, "");
  return digitos.length <= 11 ? `55${digitos}` : digitos;
}

/** Envios capturados quando o provedor e `teste` (testes automatizados). */
export const enviosDeTeste: MensagemWhatsapp[] = [];

export function provedorConfigurado(): boolean {
  if (env.WHATSAPP_PROVEDOR === "evolution") {
    return Boolean(env.WHATSAPP_EVOLUTION_URL && env.WHATSAPP_EVOLUTION_API_KEY && env.WHATSAPP_EVOLUTION_INSTANCIA);
  }
  if (env.WHATSAPP_PROVEDOR === "webhook") return Boolean(env.WHATSAPP_WEBHOOK_URL);
  return env.WHATSAPP_PROVEDOR === "teste";
}

const TEMPO_LIMITE_MS = 15_000;

async function postar(url: string, cabecalhos: Record<string, string>, corpo: object): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...cabecalhos },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(TEMPO_LIMITE_MS)
  });
}

/** Rota de envio de texto da Evolution v2: `POST {url}/message/sendText/{instancia}`. */
export function urlEnvioEvolution(base: string, instancia: string): string {
  return `${base.replace(/\/+$/u, "")}/message/sendText/${encodeURIComponent(instancia)}`;
}

/** Cada item de erro da Evolution: um texto ou a checagem do número (`{ exists: false, jid, number }`). */
type ItemDeErroEvolution = string | { exists?: boolean };
type MensagemDeErroEvolution = ItemDeErroEvolution | ItemDeErroEvolution[];

type RespostaEvolution = {
  key?: { id?: string };
  message?: MensagemDeErroEvolution;
  response?: { message?: MensagemDeErroEvolution };
} | null;

/**
 * Motivo legível do erro da Evolution, sem repetir o telefone (o erro fica gravado na fila). A v2 responde
 * `{ response: { message: [...] } }`; número sem WhatsApp vem como `[{ exists: false, ... }]`.
 */
export function erroDaEvolution(status: number, corpo: RespostaEvolution): string {
  const mensagens = corpo?.response?.message ?? corpo?.message;
  const lista: ItemDeErroEvolution[] = Array.isArray(mensagens) ? mensagens : mensagens == null ? [] : [mensagens];
  const semWhatsapp = lista.some((item) => typeof item === "object" && item !== null && item.exists === false);
  if (semWhatsapp) return "Número sem WhatsApp";
  const textos = lista.filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
  return textos.length ? `Evolution: ${textos.join("; ").slice(0, 200)}` : `Evolution respondeu HTTP ${status}`;
}

async function enviarPelaEvolution(mensagem: MensagemWhatsapp): Promise<ResultadoEnvio> {
  const resposta = await postar(
    urlEnvioEvolution(env.WHATSAPP_EVOLUTION_URL!, env.WHATSAPP_EVOLUTION_INSTANCIA!),
    { apikey: env.WHATSAPP_EVOLUTION_API_KEY! },
    { number: mensagem.telefone, text: mensagem.texto }
  );
  const corpo = (await resposta.json().catch(() => null)) as RespostaEvolution;
  if (!resposta.ok) return { ok: false, erro: erroDaEvolution(resposta.status, corpo) };
  return { ok: true, idExterno: corpo?.key?.id ?? null };
}

async function enviarPorWebhook(mensagem: MensagemWhatsapp): Promise<ResultadoEnvio> {
  const resposta = await postar(
    env.WHATSAPP_WEBHOOK_URL!,
    env.WHATSAPP_WEBHOOK_TOKEN ? { Authorization: `Bearer ${env.WHATSAPP_WEBHOOK_TOKEN}` } : {},
    { telefone: mensagem.telefone, mensagem: mensagem.texto, tipo: mensagem.tipo }
  );
  if (!resposta.ok) return { ok: false, erro: `Gateway respondeu HTTP ${resposta.status}` };
  const corpo = (await resposta.json().catch(() => null)) as { id?: string; messageId?: string } | null;
  return { ok: true, idExterno: corpo?.id ?? corpo?.messageId ?? null };
}

export async function enviarWhatsapp(mensagem: MensagemWhatsapp): Promise<ResultadoEnvio> {
  try {
    if (env.WHATSAPP_PROVEDOR === "evolution") return await enviarPelaEvolution(mensagem);
    if (env.WHATSAPP_PROVEDOR === "webhook") return await enviarPorWebhook(mensagem);
    if (env.WHATSAPP_PROVEDOR === "teste") {
      enviosDeTeste.push(mensagem);
      return { ok: true, idExterno: `teste-${enviosDeTeste.length}` };
    }
    return { ok: false, erro: "Envio automático do WhatsApp não configurado" };
  } catch (erro) {
    return { ok: false, erro: erro instanceof Error ? erro.message : "Falha ao enviar pelo WhatsApp" };
  }
}
