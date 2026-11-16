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

/**
 * Estado do WhatsApp da empresa (13/11/2026). "desligado": nenhum provedor configurado. "desconectado": a
 * Evolution respondeu que a instância está fechada ("close") — nada sai, a fila espera.
 * "indefinido" (16/11/2026): a consulta de estado falhou (HTTP de erro, sem resposta, corpo sem estado). Não se
 * sabe se a instância caiu, então a fila tenta enviar como antes e a tela não acusa queda — só a resposta clara da
 * Evolution segura a fila.
 */
export type EstadoWhatsapp = "conectado" | "desconectado" | "indefinido" | "desligado";

/** Estado com o motivo legível (sem telefone nem chave), para o aviso e para o diagnóstico. */
export type EstadoWhatsappDetalhado = { estado: EstadoWhatsapp; detalhe: string | null };

/** O estado em que a fila espera e a tela avisa: provedor desligado ou instância fechada. */
export function whatsappSegurandoFila(estado: EstadoWhatsapp): boolean {
  return estado === "desligado" || estado === "desconectado";
}

/** Rota de estado da Evolution v2: `GET {url}/instance/connectionState/{instancia}` → `{ instance: { state } }`. */
export function urlEstadoEvolution(base: string, instancia: string): string {
  return `${base.replace(/\/+$/u, "")}/instance/connectionState/${encodeURIComponent(instancia)}`;
}

// A tela e o tick de 60s perguntam o estado: 30s de cache poupa a Evolution, e 3s de limite não prende a tela.
const CACHE_ESTADO_MS = 30_000;
const LIMITE_ESTADO_MS = 3_000;
let estadoEmCache: { valor: EstadoWhatsappDetalhado; ate: number } | null = null;

/** Descarta o estado guardado (depois de uma falha de envio, e nos testes). */
export function esquecerEstadoWhatsapp(): void {
  estadoEmCache = null;
}

async function perguntarEstadoEvolution(): Promise<EstadoWhatsappDetalhado> {
  try {
    const resposta = await fetch(urlEstadoEvolution(env.WHATSAPP_EVOLUTION_URL!, env.WHATSAPP_EVOLUTION_INSTANCIA!), {
      headers: { apikey: env.WHATSAPP_EVOLUTION_API_KEY! },
      signal: AbortSignal.timeout(LIMITE_ESTADO_MS)
    });
    if (!resposta.ok) return { estado: "indefinido", detalhe: `Evolution respondeu HTTP ${resposta.status}` };
    const corpo = (await resposta.json().catch(() => null)) as { instance?: { state?: string | null } } | null;
    const estado = corpo?.instance?.state;
    if (estado === "open") return { estado: "conectado", detalhe: null };
    // Só "close" é queda. "connecting" (16/11/2026): na v2.3.7 a instância fica alternando entre conectando e
    // conectada enquanto o painel mostra Connected, e as mensagens saem nas brechas. Segurar a fila nesse estado
    // só atrasava as cotações e mostrava aviso falso; se o envio falhar, as tentativas da fila cuidam.
    if (estado === "close") return { estado: "desconectado", detalhe: "Estado na Evolution: close" };
    if (typeof estado === "string" && estado.trim())
      return { estado: "indefinido", detalhe: `Estado na Evolution: ${estado.slice(0, 40)}` };
    return { estado: "indefinido", detalhe: "Evolution respondeu sem o estado da instância" };
  } catch {
    return { estado: "indefinido", detalhe: "Sem resposta da Evolution" };
  }
}

export async function estadoDetalhadoWhatsapp(agora = Date.now()): Promise<EstadoWhatsappDetalhado> {
  if (!provedorConfigurado()) return { estado: "desligado", detalhe: null };
  // Gateway por webhook e o provedor de teste não informam conexão: configurado conta como conectado.
  if (env.WHATSAPP_PROVEDOR !== "evolution") return { estado: "conectado", detalhe: null };
  if (estadoEmCache && estadoEmCache.ate > agora) return estadoEmCache.valor;
  const valor = await perguntarEstadoEvolution();
  estadoEmCache = { valor, ate: agora + CACHE_ESTADO_MS };
  return valor;
}

export async function estadoConexaoWhatsapp(agora = Date.now()): Promise<EstadoWhatsapp> {
  return (await estadoDetalhadoWhatsapp(agora)).estado;
}

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

/**
 * Tempo de "digitando…" antes de cada mensagem (16/11/2026): o número foi bloqueado pelo WhatsApp e mensagem
 * instantânea, sem presença, é um dos sinais de envio automático. Entre 3 e 8 segundos, sorteado a cada envio.
 */
export function atrasoDigitandoMs(sorteio: number = Math.random()): number {
  return 3_000 + Math.round(sorteio * 5_000);
}

async function enviarPelaEvolution(mensagem: MensagemWhatsapp): Promise<ResultadoEnvio> {
  const resposta = await postar(
    urlEnvioEvolution(env.WHATSAPP_EVOLUTION_URL!, env.WHATSAPP_EVOLUTION_INSTANCIA!),
    { apikey: env.WHATSAPP_EVOLUTION_API_KEY! },
    { number: mensagem.telefone, text: mensagem.texto, delay: atrasoDigitandoMs() }
  );
  const corpo = (await resposta.json().catch(() => null)) as RespostaEvolution;
  if (!resposta.ok) {
    // A falha pode ser a conexão que acabou de cair: o próximo tick pergunta o estado de novo.
    esquecerEstadoWhatsapp();
    return { ok: false, erro: erroDaEvolution(resposta.status, corpo) };
  }
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
