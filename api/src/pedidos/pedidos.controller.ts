import type { FastifyInstance } from "fastify";
import {
  gerarPedidoAutomaticoPayloadSchema,
  pedidoEdicaoPayloadSchema,
  pedidoPayloadSchema,
  pedidoRecebimentoPayloadSchema,
  pedidoSituacaoPayloadSchema,
  pedidosQuerySchema
} from "@padaria/shared/pedidos";
import { apiIdParamsSchema, criadoId, ok, semConteudo } from "@padaria/shared/api";
import { exigirPermissao } from "../auth/guards.js";
import {
  alterarSituacaoPedido,
  atualizarPedido,
  criarPedido,
  gerarPedidoAutomatico,
  listarPedidos,
  obterPedido,
  receberPedido
} from "./pedidos.service.js";

export async function registrarRotasPedidos(app: FastifyInstance): Promise<void> {
  app.get("/api/pedidos", { preHandler: exigirPermissao("pedidos_visualizar") }, async (request) =>
    ok(await listarPedidos(pedidosQuerySchema.parse(request.query), request.perfilUsuario!))
  );

  app.get("/api/pedidos/:id", { preHandler: exigirPermissao("pedidos_visualizar") }, async (request) => {
    const { id } = apiIdParamsSchema.parse(request.params);
    return ok(await obterPedido(id, request.perfilUsuario!));
  });

  app.post("/api/pedidos", { preHandler: exigirPermissao("pedidos_criar") }, async (request, reply) => {
    const pedido = await criarPedido(pedidoPayloadSchema.parse(request.body), request.perfilUsuario!);
    return criadoId(reply, pedido.id);
  });

  app.post("/api/pedidos/gerar-sugestao", { preHandler: exigirPermissao("pedidos_criar") }, async (request) =>
    ok(await gerarPedidoAutomatico(gerarPedidoAutomaticoPayloadSchema.parse(request.body), request.perfilUsuario!))
  );

  app.put("/api/pedidos/:id", { preHandler: exigirPermissao("pedidos_editar") }, async (request, reply) => {
    const { id } = apiIdParamsSchema.parse(request.params);
    await atualizarPedido(id, pedidoEdicaoPayloadSchema.parse(request.body), request.perfilUsuario!);
    return semConteudo(reply);
  });

  app.post("/api/pedidos/:id/situacao", { preHandler: exigirPermissao("pedidos_editar") }, async (request, reply) => {
    const { id } = apiIdParamsSchema.parse(request.params);
    await alterarSituacaoPedido(id, pedidoSituacaoPayloadSchema.parse(request.body), request.perfilUsuario!);
    return semConteudo(reply);
  });

  app.post("/api/pedidos/:id/recebimentos", { preHandler: exigirPermissao("pedidos_aprovar") }, async (request) => {
    const { id } = apiIdParamsSchema.parse(request.params);
    return ok(await receberPedido(id, pedidoRecebimentoPayloadSchema.parse(request.body), request.perfilUsuario!));
  });
}
