import type { FastifyInstance } from "fastify";
import { relatorioProdutosQuerySchema } from "@padaria/shared/relatorios";
import { exigirPermissao } from "../autorizacao.js";
import { podeAcessarEmpresa } from "../autorizacao/empresa.js";
import { erro, paginadoDeArray } from "../respostas.js";
import { obterProdutosMaisVendidos } from "./produtos.service.js";

export async function registrarRotasRelatorioProdutos(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/relatorios/produtos-mais-vendidos",
    { preHandler: exigirPermissao("relatorio_produtos_mais_vendidos") },
    async (request, reply) => {
      const query = relatorioProdutosQuerySchema.parse(request.query);
      if (request.perfilUsuario && !podeAcessarEmpresa(request.perfilUsuario, query.empresaId)) {
        return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
      }

      return paginadoDeArray(await obterProdutosMaisVendidos(query.empresaId), query.page, query.pageSize);
    }
  );
}
