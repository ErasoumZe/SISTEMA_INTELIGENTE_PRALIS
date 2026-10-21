import type { FastifyInstance } from "fastify";
import { ok } from "@padaria/shared/api";
import { TETO_RODADA, tokenDaRodada } from "./rodada-http.js";
import { obterRodadaPublica, responderRodadaPublica } from "./rodada-publica.service.js";

/**
 * Fase 2 — rotas PUBLICAS da rodada do fornecedor. Autenticam pelo cabecalho `x-rodada-token`, tem
 * teto proprio e precisam de entrada literal na allowlist do default-deny em `app.ts`. Nenhuma
 * resposta carrega preco-base, proposta de concorrente ou vencedor (isolamento comercial).
 */
export async function registrarRotasRodadaPublica(app: FastifyInstance): Promise<void> {
  // `no-store`: a resposta chega por aparelho de terceiro; nenhum cache nem historico guarda.
  app.get("/api/rodada", TETO_RODADA, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    return ok(await obterRodadaPublica(tokenDaRodada(request)));
  });

  app.post("/api/rodada/responder", TETO_RODADA, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    return ok(await responderRodadaPublica(tokenDaRodada(request), request.body ?? {}));
  });
}
