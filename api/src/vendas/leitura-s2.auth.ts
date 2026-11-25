import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { erro } from "@padaria/shared/api";
import { env } from "../env.js";

// Autenticacao das leituras do S2 (sistema do Rodrigo): Bearer `S2_LEITURA_TOKEN`, uma empresa fixa
// (`S2_LEITURA_EMPRESA_ID`). Usada pelas vendas (vendas-s2.controller.ts) e pelas comandas do CREARE
// (comandas-creare.controller.ts).

// Limite por token (hash), nao por IP: sem trustProxy todos chegam com o IP do proxy, e quem nao tem token
// nao pode gastar o balde do S2. Pedido sem Bearer cai num balde proprio, pequeno.
function chaveDoLimite(request: FastifyRequest): string {
  const bearer = /^Bearer\s+(.+)$/iu.exec(request.headers.authorization ?? "")?.[1]?.trim();
  return bearer ? `s2:${createHash("sha256").update(bearer).digest("hex").slice(0, 16)}` : `s2-sem-token:${request.ip}`;
}
export const limiteLeituraS2 = {
  config: {
    rateLimit: {
      max: (request: FastifyRequest) => (request.headers.authorization ? 300 : 20),
      timeWindow: "1 minute",
      keyGenerator: chaveDoLimite
    }
  }
};

function mesmoToken(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Valida o Bearer do S2 e devolve a empresa configurada, ou responde o erro e devolve null. */
export function empresaDoS2(request: FastifyRequest, reply: FastifyReply): string | null {
  if (env.S2_LEITURA_TOKEN.length < 32 || !env.S2_LEITURA_EMPRESA_ID) {
    erro(reply, 503, "Leitura do S2 não configurada.", "S2_LEITURA_DESLIGADA");
    return null;
  }
  const bearer = /^Bearer\s+(.+)$/iu.exec(request.headers.authorization ?? "")?.[1]?.trim() ?? "";
  if (!bearer || !mesmoToken(bearer, env.S2_LEITURA_TOKEN)) {
    erro(reply, 401, "Token de leitura inválido.", "S2_TOKEN_INVALIDO");
    return null;
  }
  return env.S2_LEITURA_EMPRESA_ID;
}
