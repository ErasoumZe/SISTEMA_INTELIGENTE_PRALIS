import type { FastifyInstance } from "fastify";
import { pedidoRapidoPayloadSchema } from "@padaria/shared/compras";
import { ok } from "@padaria/shared/api";
import { exigirPermissao } from "../auth/guards.js";
import { criarPedidoRapido } from "./compras-pedido-rapido.service.js";

export async function registrarRotasComprasPedidoRapido(app: FastifyInstance): Promise<void> {
  // R-221 decisao 10: criar solicitacao reusa pedidos_criar e abrir rodada reusa pedidos_editar; o
  // atalho faz as duas coisas, entao exige as duas.
  app.post(
    "/api/compras/pedido-rapido",
    { preHandler: [exigirPermissao("pedidos_criar"), exigirPermissao("pedidos_editar")] },
    async (request, reply) => {
      const rodada = await criarPedidoRapido(pedidoRapidoPayloadSchema.parse(request.body), request.perfilUsuario!);
      // Devolve a rodada com o token em claro do convite, para a tela abrir o WhatsApp / copiar o link.
      reply.code(201);
      return ok(rodada);
    }
  );
}
