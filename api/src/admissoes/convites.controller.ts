import type { FastifyInstance, FastifyReply } from "fastify";
import { processoParamsSchema } from "@padaria/shared/admissoes";
import type { DadosExternos } from "@padaria/shared/api";
import { erro, ok, semConteudo } from "@padaria/shared/api";
import { exigirPermissao } from "../auth/guards.js";
import { mensagemDominioOuRelancar } from "../erros.js";
import { statusErroValidacao } from "../utils.js";
import { emitirConvite, obterPainelConvite, revogarConvite } from "./convites.service.js";

/**
 * ADM-003 V2 â€” as rotas do DP sobre o convite.
 *
 * Todas PRIVADAS: a fatia publica, onde o candidato usa o token, e a V3. Aqui nao ha nada sem
 * sessao, e por isso nenhuma entrada nova na allowlist do default-deny.
 */

function responderErro(reply: FastifyReply, error: DadosExternos) {
  const mensagem = mensagemDominioOuRelancar(error);
  return erro(reply, statusErroValidacao(mensagem), mensagem);
}

export async function registrarRotasAdmissoesConvites(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/admissoes/processos/:id/convite",
    { preHandler: exigirPermissao("admissoes_processos_visualizar") },
    async (request, reply) => {
      try {
        const { id } = processoParamsSchema.parse(request.params);
        return ok(await obterPainelConvite(id, request.perfilUsuario));
      } catch (error) {
        return responderErro(reply, error);
      }
    }
  );

  // O token em claro sai SO daqui, e uma vez. Nao ha GET que o devolva depois.
  app.post(
    "/api/admissoes/processos/:id/convite",
    { preHandler: exigirPermissao("admissoes_processos_convidar") },
    async (request, reply) => {
      try {
        const { id } = processoParamsSchema.parse(request.params);
        return ok(await emitirConvite(id, request.perfilUsuario));
      } catch (error) {
        return responderErro(reply, error);
      }
    }
  );

  app.delete(
    "/api/admissoes/processos/:id/convite",
    { preHandler: exigirPermissao("admissoes_processos_convidar") },
    async (request, reply) => {
      try {
        const { id } = processoParamsSchema.parse(request.params);
        await revogarConvite(id, request.perfilUsuario);
        return semConteudo(reply);
      } catch (error) {
        return responderErro(reply, error);
      }
    }
  );
}
