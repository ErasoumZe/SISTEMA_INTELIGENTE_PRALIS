import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  aprovarExcecaoPayloadSchema,
  contrapropostaPayloadSchema,
  decisoesQuerySchema,
  encerrarRodadaPayloadSchema,
  encerrarSolicitacaoPayloadSchema
} from "@padaria/shared/compras";
import { apiIdParamsSchema, ok, semConteudo } from "@padaria/shared/api";
import { exigirAlgumaPermissao, exigirPermissao } from "../auth/guards.js";
import { aprovarExcecao, encerrarSolicitacao, obterDecisoesDaRodada } from "./compras-decisao.service.js";
import { contraproporAoFornecedor } from "./compras-contraproposta.service.js";
import { encerrarRodadaAgora } from "./compras-fechamento.service.js";

const conviteParamsSchema = z.object({ id: z.string().uuid(), conviteId: z.string().uuid() });

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

  // E7: o comprador contrapropoe a um fornecedor que ja respondeu, com a rodada aberta. Reusa
  // pedidos_editar, como abrir/enviar (decisao 10).
  app.post(
    "/api/compras/rodadas/:id/convites/:conviteId/contraproposta",
    { preHandler: exigirPermissao("pedidos_editar") },
    async (request) => {
      const { id, conviteId } = conviteParamsSchema.parse(request.params);
      return ok(
        await contraproporAoFornecedor(
          id,
          conviteId,
          contrapropostaPayloadSchema.parse(request.body),
          request.perfilUsuario!
        )
      );
    }
  );

  // "Encerrar rodada agora" (motivo `comprador`): reusa pedidos_editar, como abrir/enviar (decisao 10).
  app.post("/api/compras/rodadas/:id/encerrar", { preHandler: exigirPermissao("pedidos_editar") }, async (request) => {
    const { id } = apiIdParamsSchema.parse(request.params);
    return ok(await encerrarRodadaAgora(id, encerrarRodadaPayloadSchema.parse(request.body), request.perfilUsuario!));
  });

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
