import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ok, paginadoDeResultado } from "@padaria/shared/api";
import { naoAutorizado } from "../erros.js";
import { empresaDoS2, limiteLeituraS2 } from "../vendas/leitura-s2.auth.js";
import {
  detalheComandaS2,
  indicadoresComandasS2,
  listarComandasS2,
  opcoesComandasS2,
  receberLoteComandas,
  receberRetratoComandas
} from "./comandas-creare.service.js";

/**
 * Comandas do CREARE (R-248).
 * - Entrada: o robo da loja, com a MESMA chave de integracao das vendas (x-api-key). A cada ciclo manda o retrato
 *   (IDs em aberto no CREARE), recebe o que conferir, e manda os lotes de comandas.
 * - Saida: o S2 (sistema do Rodrigo), so GET, Bearer `S2_LEITURA_TOKEN`, empresa `S2_LEITURA_EMPRESA_ID`.
 * Todas as rotas estao na allowlist de autenticacao propria do app.ts (fora do default-deny de sessao).
 */

function chaveIntegracao(headers: Record<string, string | string[] | undefined>): string {
  const apiKey = headers["x-api-key"];
  if (typeof apiKey === "string" && apiKey.trim()) return apiKey.trim();
  throw naoAutorizado("Chave de integracao invalida", "INVALID_INTEGRATION_KEY");
}

// Mesmo criterio da ingestao de vendas: limite por chave, nao por IP.
const limiteRobo = {
  config: {
    rateLimit: {
      max: 300,
      timeWindow: "1 minute",
      keyGenerator: (request: { headers: Record<string, string | string[] | undefined>; ip: string }) => {
        const chave = request.headers["x-api-key"];
        return typeof chave === "string" && chave
          ? `comandas:${createHash("sha256").update(chave).digest("hex").slice(0, 16)}`
          : `comandas-sem-chave:${request.ip}`;
      }
    }
  }
};

const idParamsSchema = z.object({ idComanda: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER) });

export async function registrarRotasComandasCreare(app: FastifyInstance): Promise<void> {
  app.post("/api/integracoes/comandas/retrato", limiteRobo, async (request) =>
    ok(await receberRetratoComandas(chaveIntegracao(request.headers), request.body))
  );

  app.post("/api/integracoes/comandas", limiteRobo, async (request) =>
    ok(await receberLoteComandas(chaveIntegracao(request.headers), request.body))
  );

  app.get("/api/s2/comandas", limiteLeituraS2, async (request, reply) => {
    const empresaId = empresaDoS2(request, reply);
    if (!empresaId) return reply;
    return paginadoDeResultado(await listarComandasS2(empresaId, request.query));
  });

  app.get("/api/s2/comandas/indicadores", limiteLeituraS2, async (request, reply) => {
    const empresaId = empresaDoS2(request, reply);
    if (!empresaId) return reply;
    return ok(await indicadoresComandasS2(empresaId, request.query));
  });

  app.get("/api/s2/comandas/opcoes", limiteLeituraS2, async (request, reply) => {
    const empresaId = empresaDoS2(request, reply);
    if (!empresaId) return reply;
    return ok(await opcoesComandasS2(empresaId));
  });

  app.get("/api/s2/comandas/:idComanda", limiteLeituraS2, async (request, reply) => {
    const empresaId = empresaDoS2(request, reply);
    if (!empresaId) return reply;
    const { idComanda } = idParamsSchema.parse(request.params);
    return ok(await detalheComandaS2(empresaId, idComanda));
  });
}
