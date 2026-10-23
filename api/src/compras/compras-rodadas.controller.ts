import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  abrirRodadaPayloadSchema,
  painelComprasQuerySchema,
  reenviarConvitePayloadSchema,
  rodadasQuerySchema
} from "@padaria/shared/compras";
import { apiIdParamsSchema, ok, semConteudo } from "@padaria/shared/api";
import { exigirPermissao } from "../auth/guards.js";
import { reenviarConvite } from "./compras-convidar.service.js";
import { obterCotacaoDoProduto, obterPainelCompras } from "./compras-painel.service.js";
import { abrirRodada, listarRodadas, obterRodada } from "./compras-rodadas.service.js";

const rodadaParamsSchema = z.object({ id: z.string().uuid(), conviteId: z.string().uuid() });
const empresaQuerySchema = z.object({ empresaId: z.string().uuid() });

export async function registrarRotasComprasRodadas(app: FastifyInstance): Promise<void> {
  // Doc 58 §4: Cotacao por fornecedor — cada produto em cotacao e onde cada fornecedor esta.
  app.get("/api/compras/painel", { preHandler: exigirPermissao("pedidos_visualizar") }, async (request) => {
    const { empresaId } = painelComprasQuerySchema.parse(request.query);
    return ok(await obterPainelCompras(empresaId, request.perfilUsuario!));
  });

  app.get(
    "/api/compras/painel/produtos/:id",
    { preHandler: exigirPermissao("pedidos_visualizar") },
    async (request) => {
      const { id } = apiIdParamsSchema.parse(request.params);
      const { empresaId } = painelComprasQuerySchema.parse(request.query);
      return ok(await obterCotacaoDoProduto(id, empresaId, request.perfilUsuario!));
    }
  );

  app.get("/api/compras/rodadas", { preHandler: exigirPermissao("pedidos_visualizar") }, async (request) =>
    ok(await listarRodadas(rodadasQuerySchema.parse(request.query), request.perfilUsuario!))
  );

  app.get("/api/compras/rodadas/:id", { preHandler: exigirPermissao("pedidos_visualizar") }, async (request) => {
    const { id } = apiIdParamsSchema.parse(request.params);
    const { empresaId } = empresaQuerySchema.parse(request.query);
    return ok(await obterRodada(id, empresaId, request.perfilUsuario!));
  });

  // R-221 decisao 10: abrir/enviar rodada reusa pedidos_editar.
  app.post("/api/compras/rodadas", { preHandler: exigirPermissao("pedidos_editar") }, async (request, reply) => {
    const rodada = await abrirRodada(abrirRodadaPayloadSchema.parse(request.body), request.perfilUsuario!);
    // Devolve o DTO completo (com os tokens em claro dos convites) para a tela montar os links.
    reply.code(201);
    return ok(rodada);
  });

  app.post(
    "/api/compras/rodadas/:id/convites/:conviteId/reenviar",
    { preHandler: exigirPermissao("pedidos_editar") },
    async (request, reply) => {
      const { id, conviteId } = rodadaParamsSchema.parse(request.params);
      const { empresaId } = reenviarConvitePayloadSchema.parse(request.body);
      await reenviarConvite(id, conviteId, empresaId, request.perfilUsuario!);
      return semConteudo(reply);
    }
  );
}
