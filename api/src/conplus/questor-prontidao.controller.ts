import type { FastifyInstance } from "fastify";
import { processoParamsSchema } from "@padaria/shared/admissoes";
import { erro, ok } from "@padaria/shared/api";
import { exigirPermissao } from "../auth/guards.js";
import { mensagemDominioOuRelancar } from "../erros.js";
import { statusErroValidacao } from "../utils.js";
import { obterProntidaoQuestor } from "./questor-prontidao.service.js";

/**
 * GET /api/admissoes/processos/:id/questor/prontidao — prévia de prontidão Questor (leitura).
 *
 * Mesma permissão que abre a ficha na revisão (`admissoes_processos_ver_ficha`, exclusiva do DP):
 * a prévia é derivada da ficha e não deve abrir para quem não pode lê-la.
 */
export async function registrarRotasQuestorProntidao(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/admissoes/processos/:id/questor/prontidao",
    { preHandler: exigirPermissao("admissoes_processos_ver_ficha") },
    async (request, reply) => {
      try {
        const { id } = processoParamsSchema.parse(request.params);
        return ok(await obterProntidaoQuestor(id, request.perfilUsuario));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErroValidacao(mensagem), mensagem);
      }
    }
  );
}
