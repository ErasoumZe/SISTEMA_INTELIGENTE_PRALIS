import type { FastifyInstance } from "fastify";
import { ok } from "@padaria/shared/api";
import { z } from "zod";
import { exigirPermissao } from "../auth/guards.js";
import { listarCatalogoBase } from "./produtos-catalogo-base.service.js";

const queryCatalogoBase = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
  busca: z.string().trim().max(200).optional(),
  status: z.enum(["ativo", "inativo"]).optional()
});

export async function registrarRotasCatalogoBase(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/produtos/catalogo-base",
    { preHandler: exigirPermissao("cadastro_produtos_visualizar") },
    async (request) => {
      const query = queryCatalogoBase.parse(request.query);
      const resultado = await listarCatalogoBase(query);
      return ok({ ...resultado, page: query.page, pageSize: query.pageSize });
    }
  );
}
