import type { FastifyInstance } from "fastify";
import { despesaPayloadSchema, despesasQuerySchema } from "@padaria/shared/despesas";
import { exigirAlgumaPermissao, exigirAutenticacao } from "../autorizacao.js";
import { empresasPermitidas, escopoEmpresaAtiva, podeAcessarEmpresa } from "../autorizacao/empresa.js";
import { criadoId, erro, paginadoDeArray } from "../respostas.js";
import { PermissaoLancamentoInsuficienteError } from "../lancamentos/service-utils.js";
import { criarDespesa, listarDespesas } from "./despesas.service.js";

export async function registrarRotasDespesas(app: FastifyInstance): Promise<void> {
  app.get("/api/despesas", { preHandler: exigirAlgumaPermissao(["despesas_visualizar", "contas_pagar_visualizar"]) }, async (request, reply) => {
    const query = despesasQuerySchema.parse(request.query);
    const empresasLiberadas = request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : [];
    let escopoDados: string[] | null;
    try {
      escopoDados = escopoEmpresaAtiva(empresasLiberadas, query.empresaId);
    } catch {
      return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
    }
    return paginadoDeArray(await listarDespesas(query, escopoDados), query.page, query.pageSize);
  });

  app.post("/api/despesas", async (request, reply) => {
    const dados = despesaPayloadSchema.parse(request.body);
    const perfil = await exigirAutenticacao(request, reply);
    if (!perfil) return;
    if (!podeAcessarEmpresa(perfil, dados.empresaId)) {
      return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
    }
    try {
      const despesa = await criarDespesa(dados, perfil);
      return criadoId(reply, despesa.id);
    } catch (error) {
      if (error instanceof PermissaoLancamentoInsuficienteError) {
        return erro(reply, 403, error.message, "INSUFFICIENT_PERMISSION", { permissao: error.permissao });
      }
      return erro(reply, 400, error instanceof Error ? error.message : "Despesa invalida");
    }
  });
}
