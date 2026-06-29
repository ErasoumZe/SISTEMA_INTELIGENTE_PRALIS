import { exigirAutenticacao } from "../autorizacao.js";
import { erro, ok } from "../respostas.js";
import type { AplicacaoFastify } from "../tipos/fastify.js";
import { carregarSessaoComPerfil } from "./sessao.service.js";

export async function registrarRotasSessao(app: AplicacaoFastify) {
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
}
