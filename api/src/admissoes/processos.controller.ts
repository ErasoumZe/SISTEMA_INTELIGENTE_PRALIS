import type { FastifyInstance, FastifyReply } from "fastify";
import type { DadosExternos } from "@padaria/shared/api";
import { processoParamsSchema } from "@padaria/shared/admissoes";
import { exigirPermissao } from "../auth/guards.js";
import { erro, ok } from "@padaria/shared/api";
import { mensagemDominioOuRelancar } from "../erros.js";
import { statusErroValidacao } from "../utils.js";
import { cancelarProcesso, listarHistoricoProcesso, obterProcesso } from "./processos.service.js";

function responderErro(reply: FastifyReply, error: DadosExternos) {
  const mensagem = mensagemDominioOuRelancar(error);
  return erro(reply, statusErroValidacao(mensagem), mensagem);
}

/**
 * ADM-002 V0 — rotas do processo de admissao.
 *
 * NAO existe `POST /api/admissoes/processos` nem rota de "iniciar": o processo nasce dentro da
 * transacao que encerra o teste com `aprovado_para_admissao`. Um segundo caminho para o mesmo ato e
 * o defeito que a regra-mae do PROJECT_BRAIN/16 proibe.
 *
 * NAO existe `GET /api/admissoes/processos` (lista). A V0 nao tem listagem, pagina de lista nem
 * entrada de menu — chega-se ao processo so pelo teste efetivado. Lista sem filtro, sem paginacao e
 * sem dono definido seria superficie criada antes de existir necessidade.
 */
export async function registrarRotasAdmissoesProcessos(app: FastifyInstance) {
  app.get(
    "/api/admissoes/processos/:id",
    { preHandler: exigirPermissao("admissoes_processos_visualizar") },
    async (request, reply) => {
      try {
        const { id } = processoParamsSchema.parse(request.params);
        return ok(await obterProcesso(id, request.perfilUsuario));
      } catch (error) {
        return responderErro(reply, error);
      }
    }
  );

  app.get(
    "/api/admissoes/processos/:id/historico",
    { preHandler: exigirPermissao("admissoes_processos_visualizar") },
    async (request, reply) => {
      try {
        const { id } = processoParamsSchema.parse(request.params);
        return ok(await listarHistoricoProcesso(id, request.query, request.perfilUsuario));
      } catch (error) {
        return responderErro(reply, error);
      }
    }
  );

  app.post(
    "/api/admissoes/processos/:id/cancelar",
    { preHandler: exigirPermissao("admissoes_processos_cancelar") },
    async (request, reply) => {
      try {
        const { id } = processoParamsSchema.parse(request.params);
        return ok(await cancelarProcesso(id, request.body, request.perfilUsuario));
      } catch (error) {
        return responderErro(reply, error);
      }
    }
  );
}
