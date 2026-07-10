// Envio de e-mail transacional (reset de senha + verificacao) via Resend (API HTTP, sem SDK).
// Sem RESEND_API_KEY/EMAIL_FROM configurados (dev/teste), o e-mail nao e enviado: cai no log do
// console e num outbox em memoria (emailsCapturados) para inspecao em desenvolvimento e nos testes.
import { env } from "../env.js";

// token e opcional e serve so para inspecao/teste (o envio real usa apenas html/assunto).
export type EmailMensagem = { para: string; assunto: string; html: string; url?: string; token?: string };

// Outbox em memoria. So recebe itens quando NAO ha envio real (dev/teste) — nao acumula em producao.
export const emailsCapturados: Array<{
  para: string;
  assunto: string;
  url?: string | undefined;
  token?: string | undefined;
}> = [];

// Monta um HTML simples e legivel para os e-mails de acao (botao + link de fallback).
export function montarHtmlEmail(titulo: string, texto: string, rotuloAcao: string, url: string): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;color:#2f2320">
  <h2 style="color:#c0521d">${titulo}</h2>
  <p>${texto}</p>
  <p style="margin:24px 0">
    <a href="${url}" style="display:inline-block;background:#c0521d;color:#ffffff;padding:11px 20px;border-radius:8px;text-decoration:none;font-weight:600">${rotuloAcao}</a>
  </p>
  <p style="color:#6f635c;font-size:12px">Ou copie e cole este link no navegador:<br />${url}</p>
  <p style="color:#6f635c;font-size:12px">Se voce nao solicitou, ignore este e-mail.</p>
</div>`;
}

export async function enviarEmail(mensagem: EmailMensagem): Promise<void> {
  const remetente = env.EMAIL_FROM;
  if (!env.RESEND_API_KEY || !remetente) {
    console.info(
      `[email] nao enviado (sem RESEND_API_KEY/EMAIL_FROM) para=${mensagem.para} assunto="${mensagem.assunto}" url=${mensagem.url ?? "-"}`
    );
    emailsCapturados.push({
      para: mensagem.para,
      assunto: mensagem.assunto,
      url: mensagem.url,
      token: mensagem.token
    });
    return;
  }

  const resposta = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ from: remetente, to: mensagem.para, subject: mensagem.assunto, html: mensagem.html })
  });

  if (!resposta.ok) {
    throw new Error(`[email] Resend respondeu ${resposta.status}: ${await resposta.text()}`);
  }
}
