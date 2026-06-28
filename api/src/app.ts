import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { fromNodeHeaders } from "better-auth/node";
import { ZodError } from "zod";
import { auth } from "./auth.js";
import { env } from "./env.js";
import { registrarRotasCaixa } from "./caixa/caixa.controller.js";
import { registrarRotasCadastros } from "./cadastros/cadastros.controller.js";
import { registrarRotasCatalogos } from "./catalogos/catalogos.controller.js";
import { registrarRotasColaboradores } from "./colaboradores/colaboradores.controller.js";
import { registrarRotasCopia } from "./copia/copia.controller.js";
import { registrarRotasMalotes } from "./malotes/malotes.controller.js";
import { registrarRotasMovimentacao } from "./movimentacao/movimentacao.controller.js";
import { registrarRotasRelatorioProdutos } from "./relatorios/produtos.controller.js";
import { registrarRotasSaude } from "./saude/saude.controller.js";
import { registrarRotasSessao } from "./sessao/sessao.controller.js";
import { registrarRotasTema } from "./tema/tema.controller.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: process.env["NODE_ENV"] !== "test" });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        erro: "Requisicao invalida",
        detalhes: error.issues.map((issue) => ({
          caminho: issue.path.join("."),
          mensagem: issue.message
        }))
      });
    }

    request.log.error(error);
    return reply.status(500).send({ erro: "Erro interno" });
  });

  await app.register(cors, {
    origin: env.WEB_ORIGIN,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"]
  });

  await registrarRotasSaude(app);
  await registrarRotasSessao(app);
  await registrarRotasTema(app);
  await registrarRotasMovimentacao(app);
  await registrarRotasCaixa(app);
  await registrarRotasCatalogos(app);
  await registrarRotasColaboradores(app);
  await registrarRotasMalotes(app);
  await registrarRotasCadastros(app);
  await registrarRotasCopia(app);
  await registrarRotasRelatorioProdutos(app);

  app.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
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
        return reply.status(500).send({
          error: "Internal authentication error",
          code: "AUTH_FAILURE"
        });
      }
    }
  });

  return app;
}
