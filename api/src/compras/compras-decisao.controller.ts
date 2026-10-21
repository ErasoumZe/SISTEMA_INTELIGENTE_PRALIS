import type { FastifyInstance } from "fastify";
import {
  aprovarExcecaoPayloadSchema,
  decisoesQuerySchema,
  encerrarSolicitacaoPayloadSchema
} from "@padaria/shared/compras";
import { apiIdParamsSchema, ok, semConteudo } from "@padaria/shared/api";
import { exigirAlgumaPermissao, exigirPermissao } from "../auth/guards.js";
import { aprovarExcecao, encerrarSolicitacao, obterDecisoesDaRodada } from "./compras-decisao.service.js";

export async function registrarRotasComprasDecisao(app: FastifyInstance): Promise<void> {
  // A fila mostra preco-base e a proposta de TODOS os fornecedores: so quem decide (ou opera a rodada)
  // le. Ter a tela de Pedidos nao basta.
  app.get(
    "/api/compras/rodadas/:id/decisoes",
    { preHandler: exigirAlgumaPermissao(["pedidos_editar", "compras_excecao_aprovar"]) },
    async (request) => {
      const { id } = apiIdParamsSchema.parse(request.params);
      const { empresaId } = decisoesQuerySchema.parse(request.query);
      return ok(await obterDecisoesDaRodada(id, empresaId, request.perfilUsuario!));
    }
  );

  // R-221 decisao 10: aprovar compra fora do envelope pre-autorizado e permissao propria.
  app.post(
    "/api/compras/rodadas/:id/decisoes/aprovar",
    { preHandler: exigirPermissao("compras_excecao_aprovar") },
    async (request) => {
      const { id } = apiIdParamsSchema.parse(request.params);
      return ok(await aprovarExcecao(id, aprovarExcecaoPayloadSchema.parse(request.body), request.perfilUsuario!));
    }
  );

  app.post(
    "/api/compras/solicitacoes/:id/encerrar",
    { preHandler: exigirPermissao("pedidos_editar") },
    async (request, reply) => {
      const { id } = apiIdParamsSchema.parse(request.params);
      await encerrarSolicitacao(id, encerrarSolicitacaoPayloadSchema.parse(request.body), request.perfilUsuario!);
      return semConteudo(reply);
    }
  );
}
