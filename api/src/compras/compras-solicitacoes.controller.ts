import type { FastifyInstance } from "fastify";
import {
  solicitacaoEdicaoPayloadSchema,
  solicitacaoPayloadSchema,
  solicitacoesQuerySchema
} from "@padaria/shared/compras";
import { apiIdParamsSchema, criadoId, ok, semConteudo } from "@padaria/shared/api";
import { exigirPermissao } from "../auth/guards.js";
import {
  atualizarSolicitacao,
  criarSolicitacao,
  listarSolicitacoes,
  obterSolicitacao
} from "./compras-solicitacoes.service.js";

export async function registrarRotasComprasSolicitacoes(app: FastifyInstance): Promise<void> {
  app.get("/api/compras/solicitacoes", { preHandler: exigirPermissao("pedidos_visualizar") }, async (request) =>
    ok(await listarSolicitacoes(solicitacoesQuerySchema.parse(request.query), request.perfilUsuario!))
  );

  app.get("/api/compras/solicitacoes/:id", { preHandler: exigirPermissao("pedidos_visualizar") }, async (request) => {
    const { id } = apiIdParamsSchema.parse(request.params);
    return ok(await obterSolicitacao(id, request.perfilUsuario!));
  });

  // R-221 decisao 10: solicitacao reusa pedidos_criar (nasce sem fornecedor).
  app.post("/api/compras/solicitacoes", { preHandler: exigirPermissao("pedidos_criar") }, async (request, reply) => {
    const criada = await criarSolicitacao(solicitacaoPayloadSchema.parse(request.body), request.perfilUsuario!);
    return criadoId(reply, criada.id);
  });

  app.put(
    "/api/compras/solicitacoes/:id",
    { preHandler: exigirPermissao("pedidos_editar") },
    async (request, reply) => {
      const { id } = apiIdParamsSchema.parse(request.params);
      await atualizarSolicitacao(id, solicitacaoEdicaoPayloadSchema.parse(request.body), request.perfilUsuario!);
      return semConteudo(reply);
    }
  );
}
