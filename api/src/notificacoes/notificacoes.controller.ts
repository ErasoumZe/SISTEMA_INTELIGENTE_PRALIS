import type { FastifyInstance } from "fastify";
import { erro, ok, semConteudo } from "@padaria/shared/api";
import { notificacaoParamsSchema, notificacoesQuerySchema } from "@padaria/shared/notificacoes";
import { mensagemDominioOuRelancar } from "../erros.js";
import { listarNotificacoes, verificarNotificacao, verificarTodasNotificacoes } from "./notificacoes.service.js";

export async function registrarRotasNotificacoes(app: FastifyInstance) {
  app.get("/api/notificacoes", async (request, reply) => {
    const { empresaId, incluirVerificadas } = notificacoesQuerySchema.parse(request.query);
    try {
      return ok(await listarNotificacoes(empresaId, request.perfilUsuario!, incluirVerificadas));
    } catch (error) {
      return erro(reply, 403, mensagemDominioOuRelancar(error));
    }
  });

  app.put("/api/notificacoes/:notificacaoId/verificar", async (request, reply) => {
    const { notificacaoId } = notificacaoParamsSchema.parse(request.params);
    const { empresaId } = notificacoesQuerySchema.parse(request.query);
    try {
      await verificarNotificacao(notificacaoId, empresaId, request.perfilUsuario!);
      return semConteudo(reply);
    } catch (error) {
      const mensagem = mensagemDominioOuRelancar(error);
      return erro(reply, mensagem === "Notificacao nao encontrada" ? 404 : 403, mensagem);
    }
  });

  app.put("/api/notificacoes/verificar-todas", async (request, reply) => {
    const { empresaId } = notificacoesQuerySchema.parse(request.query);
    try {
      return ok({ total: await verificarTodasNotificacoes(empresaId, request.perfilUsuario!) });
    } catch (error) {
      return erro(reply, 403, mensagemDominioOuRelancar(error));
    }
  });
}
