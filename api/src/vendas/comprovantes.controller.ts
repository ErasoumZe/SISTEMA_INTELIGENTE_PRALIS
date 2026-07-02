import { mensagemDominioOuRelancar } from "../erros.js";
import type { FastifyInstance } from "fastify";
import { vendaParamsSchema } from "@padaria/shared/vendas";
import { exigirPermissao } from "../auth/guards.js";
import { erro, ok } from "@padaria/shared/api";
import { listarComprovantesVenda, salvarComprovanteVenda } from "./comprovantes.service.js";

function statusErro(mensagem: string) {
  if (mensagem === "Venda nao encontrada") return 404;
  if (mensagem === "Empresa nao permitida") return 403;
  return 400;
}

export async function registrarRotasVendasComprovantes(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/vendas/:vendaId/comprovantes",
    { preHandler: exigirPermissao("relatorio_vendas_visualizar") },
    async (request, reply) => {
      const { vendaId } = vendaParamsSchema.parse(request.params);
      try {
        return ok(await listarComprovantesVenda(vendaId, request.perfilUsuario!));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErro(mensagem), mensagem);
      }
    }
  );

  app.post(
    "/api/vendas/:vendaId/comprovantes",
    { preHandler: exigirPermissao("relatorio_vendas_comprovantes_criar") },
    async (request, reply) => {
      const { vendaId } = vendaParamsSchema.parse(request.params);
      try {
        const arquivo = await request.file({ limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
        return reply.status(201).send(ok(await salvarComprovanteVenda(vendaId, arquivo, request.perfilUsuario!)));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErro(mensagem), mensagem);
      }
    }
  );
}
