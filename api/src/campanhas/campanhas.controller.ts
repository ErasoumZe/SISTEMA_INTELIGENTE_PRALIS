import type { FastifyInstance } from "fastify";
import { criadoId, ok, semConteudo } from "@padaria/shared/api";
import {
  campanhaParamsSchema,
  campanhaPayloadSchema,
  campanhaStatusPayloadSchema,
  campanhasFechamentoQuerySchema,
  campanhasQuerySchema
} from "@padaria/shared/campanhas";
import { exigirAlgumaPermissao, exigirPermissao } from "../auth/guards.js";
import { campanhasDoFechamento, listarCampanhas, mudarStatusCampanha, salvarCampanha } from "./campanhas.service.js";

// R-200: campanhas tem UMA tela propria, visivel por `campanhas_visualizar`. Criar, editar, encerrar
// e cancelar exigem `campanhas_gerenciar` — e o servidor exige as duas de novo, porque o menu nunca
// e a unica protecao.
export async function registrarRotasCampanhas(app: FastifyInstance) {
  app.get("/api/campanhas", { preHandler: exigirPermissao("campanhas_visualizar") }, async (request) => {
    const { empresaId } = campanhasQuerySchema.parse(request.query);
    return ok(await listarCampanhas(empresaId, request.perfilUsuario!));
  });

  // O operador ve o resultado no fechamento do PROPRIO caixa: `caixa_operar` basta, e o servico so
  // devolve campanha ATIVA que cobre o dia e inclui aquele PDV.
  app.get(
    "/api/campanhas/fechamento",
    { preHandler: exigirAlgumaPermissao(["caixa_operar", "campanhas_visualizar", "caixas_gerenciar"]) },
    async (request) => {
      const { empresaId, pdvId, dia } = campanhasFechamentoQuerySchema.parse(request.query);
      return ok(await campanhasDoFechamento({ empresaId, pdvId, dia, perfil: request.perfilUsuario! }));
    }
  );

  app.post("/api/campanhas", { preHandler: exigirPermissao("campanhas_gerenciar") }, async (request, reply) => {
    const dados = campanhaPayloadSchema.parse(request.body);
    const criada = await salvarCampanha(dados, request.perfilUsuario!);
    return criadoId(reply, criada.id);
  });

  app.put(
    "/api/campanhas/:campanhaId",
    { preHandler: exigirPermissao("campanhas_gerenciar") },
    async (request, reply) => {
      const { campanhaId } = campanhaParamsSchema.parse(request.params);
      const dados = campanhaPayloadSchema.parse(request.body);
      await salvarCampanha(dados, request.perfilUsuario!, campanhaId);
      return semConteudo(reply);
    }
  );

  app.put(
    "/api/campanhas/:campanhaId/status",
    { preHandler: exigirPermissao("campanhas_gerenciar") },
    async (request, reply) => {
      const { campanhaId } = campanhaParamsSchema.parse(request.params);
      const { empresaId } = campanhasQuerySchema.parse(request.query);
      const { status } = campanhaStatusPayloadSchema.parse(request.body);
      await mudarStatusCampanha(campanhaId, empresaId, status, request.perfilUsuario!);
      return semConteudo(reply);
    }
  );
}
