import type { FastifyInstance } from "fastify";
import {
  conferenciaEstoquePayloadSchema,
  conferenciasEstoqueQuerySchema,
  estoqueMovimentosQuerySchema,
  estoqueProdutosQuerySchema
} from "@padaria/shared/compras";
import { criadoId, ok } from "@padaria/shared/api";
import { exigirPermissao } from "../auth/guards.js";
import {
  agendarConferenciaEstoque,
  listarConferenciasEstoque,
  listarEstoqueMovimentos,
  listarEstoqueProdutos
} from "./compras.service.js";

export async function registrarRotasCompras(app: FastifyInstance): Promise<void> {
  app.get("/api/compras/estoque", { preHandler: exigirPermissao("estoque_produtos_visualizar") }, async (request) =>
    ok(await listarEstoqueProdutos(estoqueProdutosQuerySchema.parse(request.query), request.perfilUsuario!))
  );
  app.get(
    "/api/compras/estoque/movimentos",
    { preHandler: exigirPermissao("estoque_produtos_visualizar") },
    async (request) =>
      ok(await listarEstoqueMovimentos(estoqueMovimentosQuerySchema.parse(request.query), request.perfilUsuario!))
  );
  app.get(
    "/api/compras/conferencias",
    { preHandler: exigirPermissao("conferencias_estoque_visualizar") },
    async (request) =>
      ok(await listarConferenciasEstoque(conferenciasEstoqueQuerySchema.parse(request.query), request.perfilUsuario!))
  );
  app.post(
    "/api/compras/conferencias",
    { preHandler: exigirPermissao("conferencias_estoque_agendar") },
    async (request, reply) => {
      const conferencia = await agendarConferenciaEstoque(
        conferenciaEstoquePayloadSchema.parse(request.body),
        request.perfilUsuario!
      );
      return criadoId(reply, conferencia.id);
    }
  );
}
