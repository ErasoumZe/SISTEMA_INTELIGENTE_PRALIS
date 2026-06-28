import { exigirAutenticacao } from "../autorizacao.js";
import type { AplicacaoFastify } from "../tipos/fastify.js";
import { carregarSessaoComPerfil } from "./sessao.service.js";

export async function registrarRotasSessao(app: AplicacaoFastify) {
  app.get("/api/me", async (request, reply) => {
    const sessao = await carregarSessaoComPerfil(request);
    if (!sessao) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    return reply.send(sessao);
  });

  app.get("/api/sessao", async (request, reply) => {
    const perfil = await exigirAutenticacao(request, reply);
    if (!perfil) return;
    return { perfil };
  });
}
