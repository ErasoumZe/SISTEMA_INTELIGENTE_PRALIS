// Envio de e-mail transacional (reset de senha + verificacao) via Resend (API HTTP, sem SDK).
// Sem RESEND_API_KEY/EMAIL_FROM configurados, o e-mail nao e enviado: fora de producao ele cai num
// outbox em memoria (emailsCapturados) para inspecao em desenvolvimento e nos testes.
import { env } from "../env.js";

// token e opcional e serve so para inspecao/teste (o envio real usa apenas html/assunto).
export type EmailMensagem = { para: string; assunto: string; html: string; url?: string; token?: string };

// A url do reset carrega o token NO PROPRIO CAMINHO (`/api/auth/reset-password/<token>`), entao
// guardar ou logar a url equivale a guardar ou logar o token. Por isso o outbox so existe fora de
// producao: em producao ele viraria uma lista, em memoria e sem expiracao, de tokens validos de
// troca de senha de qualquer usuario que pedisse recuperacao — e enche justamente no cenario em que
// o Resend nao esta configurado, que e o que acontece hoje (ver o bloqueio de deploy no relatorio).
const guardarEmMemoria = env.NODE_ENV !== "production";

// Outbox em memoria. So recebe itens quando NAO ha envio real e o ambiente nao e producao.
export const emailsCapturados: Array<{
  para: string;
  assunto: string;
  html: string;
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
    // A url NAO entra no log: ela contem o token de troca de senha. Em desenvolvimento o link e
    // impresso porque e assim que se testa o fluxo na maquina local, e la nao ha usuario real —
    // em teste e em producao, nunca.
    const linkParaDev = env.NODE_ENV === "development" ? ` url=${mensagem.url ?? "-"}` : "";
    console.info(
      `[email] nao enviado (sem RESEND_API_KEY/EMAIL_FROM) para=${mensagem.para} assunto="${mensagem.assunto}"${linkParaDev}`
    );
    if (guardarEmMemoria) {
      emailsCapturados.push({
        para: mensagem.para,
        assunto: mensagem.assunto,
        html: mensagem.html,
        url: mensagem.url,
        token: mensagem.token
      });
    }
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
