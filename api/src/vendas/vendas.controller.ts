import type { FastifyInstance } from "fastify";
import { vendaPayloadSchema, vendasQuerySchema } from "@padaria/shared/vendas";
import { exigirAlgumaPermissao, exigirAutenticacao } from "../autorizacao.js";
import { empresasPermitidas, escopoEmpresaAtiva, podeAcessarEmpresa } from "../autorizacao/empresa.js";
import { criadoId, erro, paginadoDeArray } from "../respostas.js";
import { PermissaoLancamentoInsuficienteError } from "../lancamentos/service-utils.js";
import { criarVenda, listarVendas } from "./vendas.service.js";

export async function registrarRotasVendas(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/vendas",
      { preHandler: exigirAlgumaPermissao(["entradas_visualizar", "relatorio_vendas_visualizar"]) },
    async (request, reply) => {
      const query = vendasQuerySchema.parse(request.query);
      const empresasLiberadas = request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : [];
      let escopoDados: string[] | null;
      try {
        escopoDados = escopoEmpresaAtiva(empresasLiberadas, query.empresaId);
      } catch {
        return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
      }

      return paginadoDeArray(await listarVendas(query, escopoDados), query.page, query.pageSize);
    }
  );

  app.post("/api/vendas", async (request, reply) => {
    const dados = vendaPayloadSchema.parse(request.body);
    const perfil = await exigirAutenticacao(request, reply);
    if (!perfil) return;

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
