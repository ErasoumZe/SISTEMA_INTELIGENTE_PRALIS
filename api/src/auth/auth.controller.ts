import { fromNodeHeaders } from "better-auth/node";
import type { FastifyInstance } from "fastify";
import { env } from "../env.js";
import { erro, ok } from "@padaria/shared/api";
import { auth } from "./config.js";
import { exigirAutenticacao } from "./guards.js";
import { carregarSessaoComPerfil } from "./sessao.service.js";

export async function registrarRotasAuth(app: FastifyInstance) {
  app.get("/api/me", async (request, reply) => {
    const sessao = await carregarSessaoComPerfil(request);
    if (!sessao) {
      return erro(reply, 401, "Nao autenticado", "UNAUTHENTICATED");
    }

    return ok(sessao);
  });

  app.get("/api/sessao", async (request, reply) => {
    const perfil = await exigirAutenticacao(request, reply);
    if (!perfil) return;
    return ok({ perfil });
  });

  app.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    config: {
      rateLimit: {
        max: 20,
        timeWindow: "1 minute"
      }
    },
    async handler(request, reply) {
      try {
        const url = new URL(request.url, env.AUTH_BASE_URL);
        const req = new Request(url.toString(), {
          method: request.method,
          headers: fromNodeHeaders(request.headers),
          ...(request.body ? { body: JSON.stringify(request.body) } : {})
        });

        const response = await auth.handler(req);
        reply.status(response.status);
        for (const [key, value] of response.headers.entries()) {
          reply.header(key, value);
        }
        return reply.send(response.body ? await response.text() : null);
      } catch (error) {
        request.log.error(error, "authentication route failed");
        return erro(reply, 500, "Erro interno de autenticação", "AUTH_FAILURE");
      }
    }
  });
}
