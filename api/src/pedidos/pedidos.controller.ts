import type { FastifyInstance } from "fastify";
import {
  pedidoRecebimentoPayloadSchema,
  pedidoSituacaoPayloadSchema,
  pedidosQuerySchema
} from "@padaria/shared/pedidos";
import { apiIdParamsSchema, ok, semConteudo } from "@padaria/shared/api";
import { confirmarPedidoPayloadSchema } from "@padaria/shared/compras";
import { exigirPermissao } from "../auth/guards.js";
import { alterarSituacaoPedido, listarPedidos, obterPedido, receberPedido } from "./pedidos.service.js";
import { confirmarPedido } from "../compras/compras-separacao.service.js";

/**
 * Pedidos depois do E8 (R-221): so LEITURA, cancelamento e recebimento. O pedido nasce da rodada de
 * cotacao (compra automatica ou excecao do comprador, ja confirmado); criar, editar, gerar sugestao e
 * confirmar na mao eram o segundo caminho de compra e foram removidos.
 */
export async function registrarRotasPedidos(app: FastifyInstance): Promise<void> {
  app.get("/api/pedidos", { preHandler: exigirPermissao("pedidos_visualizar") }, async (request) =>
    ok(await listarPedidos(pedidosQuerySchema.parse(request.query), request.perfilUsuario!))
  );

  app.get("/api/pedidos/:id", { preHandler: exigirPermissao("pedidos_visualizar") }, async (request) => {
    const { id } = apiIdParamsSchema.parse(request.params);
    return ok(await obterPedido(id, request.perfilUsuario!));
  });

  // Doc 57 §5: o fornecedor devolveu a separacao (ou o comprador aceita como cotado); confirmar = Comprado, e o
  // fornecedor recebe o "pode entregar" pelo WhatsApp.
  app.post("/api/pedidos/:id/confirmar", { preHandler: exigirPermissao("pedidos_editar") }, async (request, reply) => {
    const { id } = apiIdParamsSchema.parse(request.params);
    const { empresaId } = confirmarPedidoPayloadSchema.parse(request.body ?? {});
    await confirmarPedido(id, empresaId, request.perfilUsuario!);
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
