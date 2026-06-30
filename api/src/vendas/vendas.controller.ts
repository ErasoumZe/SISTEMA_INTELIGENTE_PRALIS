import type { FastifyInstance } from "fastify";
import { vendaPayloadSchema, vendasQuerySchema } from "@padaria/shared/vendas";
import { exigirAlgumaPermissao, exigirPermissao } from "../auth/guards.js";
import { empresasPermitidas, escopoEmpresaAtiva, podeAcessarEmpresa } from "../auth/empresa.js";
import { criadoId, erro, paginadoDeArray } from "@padaria/shared/api";
import { PermissaoLancamentoInsuficienteError } from "../lancamentos/lancamentos.dominio.js";
import { criarVenda, listarVendas } from "./vendas.service.js";

export async function registrarRotasVendas(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/vendas",
    { preHandler: exigirAlgumaPermissao(["entradas_visualizar", "relatorio_vendas_visualizar"]) },
    async (request, reply) => {
      const query = vendasQuerySchema.parse(request.query);
      const empresasLiberadas = request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : [];
      let escopoDados: string[];
      try {
        escopoDados = escopoEmpresaAtiva(empresasLiberadas, query.empresaId);
      } catch {
        return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
      }

      return paginadoDeArray(await listarVendas(query, escopoDados), query.page, query.pageSize);
    }
  );

  app.post("/api/vendas", { preHandler: exigirPermissao("entradas_criar") }, async (request, reply) => {
    const dados = vendaPayloadSchema.parse(request.body);
    const perfil = request.perfilUsuario;
    if (!perfil) return erro(reply, 401, "Nao autenticado", "UNAUTHENTICATED");

    if (!podeAcessarEmpresa(perfil, dados.empresaId)) {
      return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
    }

    try {
      const venda = await criarVenda(dados, perfil);
      return criadoId(reply, venda.id);
    } catch (error) {
      if (error instanceof PermissaoLancamentoInsuficienteError) {
        return erro(reply, 403, error.message, "INSUFFICIENT_PERMISSION", { permissao: error.permissao });
      }
      return erro(reply, 400, error instanceof Error ? error.message : "Venda invalida");
    }
  });
}
