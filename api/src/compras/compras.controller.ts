import type { FastifyInstance } from "fastify";
import { estoqueMovimentosQuerySchema, estoqueProdutosQuerySchema } from "@padaria/shared/compras";
import { ok } from "@padaria/shared/api";
import { exigirPermissao } from "../auth/guards.js";
import { listarEstoqueMovimentos, listarEstoqueProdutos } from "./compras.service.js";

// Conferencias de estoque (doc 57 §1) moram em conferencias-estoque.controller.ts.
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
}
