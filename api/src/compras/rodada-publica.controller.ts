import type { FastifyInstance } from "fastify";
import { ok } from "@padaria/shared/api";
import { TETO_RODADA, tokenDaRodada } from "./rodada-http.js";
import { aceitarContrapropostaPublica, obterRodadaPublica, responderRodadaPublica } from "./rodada-publica.service.js";
import { itensCompradosDoConvite, processarCompraAutomatica } from "./compras-adjudicacao.service.js";

/**
 * Fase 2 — rotas PUBLICAS da rodada do fornecedor. Autenticam pelo cabecalho `x-rodada-token`, tem
 * teto proprio e precisam de entrada literal na allowlist do default-deny em `app.ts`. Nenhuma
 * resposta carrega preco-base, proposta de concorrente ou vencedor (isolamento comercial).
 */
export async function registrarRotasRodadaPublica(app: FastifyInstance): Promise<void> {
  // `no-store`: a resposta chega por aparelho de terceiro; nenhum cache nem historico guarda.
  app.get("/api/rodada", TETO_RODADA, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    return ok(await obterRodadaPublica(tokenDaRodada(request), itensCompradosDoConvite));
  });

  app.post("/api/rodada/responder", TETO_RODADA, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const { versao, propostaId } = await responderRodadaPublica(tokenDaRodada(request), request.body ?? {});
    // Compra automatica (decisao 1): roda no modulo do COMPRADOR, nunca devolve base ao fornecedor. A
    // resposta ja esta gravada; uma falha aqui so adia o item para o fechamento, nao perde a resposta.
    try {
      await processarCompraAutomatica(propostaId);
    } catch (causa) {
      request.log.error(causa, "falha na compra automatica; item cai para decisao no fechamento");
    }
    return ok({ versao });
  });

  // E7: aceitar a contraproposta vira a versao N+1 do fornecedor e atravessa o MESMO portao da compra
  // automatica que qualquer resposta (decisao 7).
  app.post("/api/rodada/aceitar", TETO_RODADA, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const { versao, propostaId } = await aceitarContrapropostaPublica(tokenDaRodada(request));
    try {
      await processarCompraAutomatica(propostaId);
    } catch (causa) {
      request.log.error(causa, "falha na compra automatica; item cai para decisao no fechamento");
    }
    return ok({ versao });
  });
}
