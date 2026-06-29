import type { FastifyInstance } from "fastify";
import { relatorioProdutosQuerySchema } from "@padaria/shared/relatorios";
import { exigirPermissao } from "../auth/guards.js";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import { erro, paginadoDeArray } from "@padaria/shared/api";
import { obterProdutosMaisVendidos } from "./produtos-mais-vendidos.service.js";

export async function registrarRotasProdutosMaisVendidos(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/vendas/produtos-mais-vendidos",
    { preHandler: exigirPermissao("relatorio_produtos_visualizar") },
    async (request, reply) => {
      const query = relatorioProdutosQuerySchema.parse(request.query);
      if (request.perfilUsuario && !podeAcessarEmpresa(request.perfilUsuario, query.empresaId)) {
        return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
      }

      return paginadoDeArray(await obterProdutosMaisVendidos(query.empresaId), query.page, query.pageSize);
    }
  );
}


