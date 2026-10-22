import { env } from "../env.js";

// Envio pelo WhatsApp (doc 57 §3): o sistema manda a cotação ao fornecedor, ninguém copia link. Provedor
// escolhido por variável de ambiente; sem configuração, nada sai e a fila espera (a tela avisa).

export type MensagemWhatsapp = {
  /** Só dígitos, com DDI (55...). */
  telefone: string;
  tipo: "convite" | "pedido_confirmado";
  /** Texto pronto (gateway por webhook). */
  texto: string;
  /** Parâmetros do modelo aprovado (Meta Cloud API), na ordem do modelo. */
  parametros: string[];
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
  if (env.WHATSAPP_PROVEDOR === "meta") return Boolean(env.WHATSAPP_META_TOKEN && env.WHATSAPP_META_TELEFONE_ID);
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

async function enviarPelaMeta(mensagem: MensagemWhatsapp): Promise<ResultadoEnvio> {
  const modelo = mensagem.tipo === "convite" ? env.WHATSAPP_META_MODELO_COTACAO : env.WHATSAPP_META_MODELO_CONFIRMACAO;
  const resposta = await postar(
    `https://graph.facebook.com/${env.WHATSAPP_META_VERSAO_API}/${env.WHATSAPP_META_TELEFONE_ID}/messages`,
    { Authorization: `Bearer ${env.WHATSAPP_META_TOKEN}` },
    {
      messaging_product: "whatsapp",
      to: mensagem.telefone,
      type: "template",
      template: {
        name: modelo,
        language: { code: env.WHATSAPP_META_IDIOMA },
        components: [{ type: "body", parameters: mensagem.parametros.map((texto) => ({ type: "text", text: texto })) }]
      }
    }
  );
  const corpo = (await resposta.json().catch(() => null)) as {
    messages?: Array<{ id?: string }>;
    error?: { message?: string };
  } | null;
  if (!resposta.ok) return { ok: false, erro: corpo?.error?.message ?? `Meta respondeu HTTP ${resposta.status}` };
  return { ok: true, idExterno: corpo?.messages?.[0]?.id ?? null };
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
    if (env.WHATSAPP_PROVEDOR === "meta") return await enviarPelaMeta(mensagem);
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
