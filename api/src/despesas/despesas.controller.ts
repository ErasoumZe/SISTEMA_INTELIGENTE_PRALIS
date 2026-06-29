import type { FastifyInstance } from "fastify";
import { despesaPayloadSchema, despesasQuerySchema } from "@padaria/shared/despesas";
import { exigirAlgumaPermissao, exigirPermissao } from "../auth/guards.js";
import { empresasPermitidas, escopoEmpresaAtiva, podeAcessarEmpresa } from "../auth/empresa.js";
import { criadoId, erro, paginadoDeArray } from "@padaria/shared/api";
import { PermissaoLancamentoInsuficienteError } from "./despesas.lancamento.js";
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

  app.post("/api/despesas", { preHandler: exigirPermissao("despesas_criar") }, async (request, reply) => {
    const dados = despesaPayloadSchema.parse(request.body);
    const perfil = request.perfilUsuario;
    if (!perfil) return erro(reply, 401, "Nao autenticado", "UNAUTHENTICATED");
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



