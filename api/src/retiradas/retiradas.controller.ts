import type { FastifyInstance } from "fastify";
import { retiradaPayloadSchema, retiradasQuerySchema } from "@padaria/shared/retiradas";
import { exigirPermissao } from "../auth/guards.js";
import { empresasPermitidas, escopoEmpresaAtiva, podeAcessarEmpresa } from "../auth/empresa.js";
import { criadoId, erro, paginadoDeArray } from "@padaria/shared/api";
import { PermissaoLancamentoInsuficienteError } from "./retiradas.lancamento.js";
import { criarRetirada, listarRetiradas } from "./retiradas.service.js";

export async function registrarRotasRetiradas(app: FastifyInstance): Promise<void> {
  app.get("/api/retiradas", { preHandler: exigirPermissao("retiradas_visualizar") }, async (request, reply) => {
    const query = retiradasQuerySchema.parse(request.query);
    const empresasLiberadas = request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : [];
    let escopoDados: string[] | null;
    try {
      escopoDados = escopoEmpresaAtiva(empresasLiberadas, query.empresaId);
    } catch {
      return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
    }
    return paginadoDeArray(await listarRetiradas(query, escopoDados), query.page, query.pageSize);
  });

  app.post("/api/retiradas", { preHandler: exigirPermissao("retiradas_criar") }, async (request, reply) => {
    const dados = retiradaPayloadSchema.parse(request.body);
    const perfil = request.perfilUsuario;
    if (!perfil) return erro(reply, 401, "Nao autenticado", "UNAUTHENTICATED");
    if (!podeAcessarEmpresa(perfil, dados.empresaId)) {
      return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
    }
    try {
      const retirada = await criarRetirada(dados, perfil);
      return criadoId(reply, retirada.id);
    } catch (error) {
      if (error instanceof PermissaoLancamentoInsuficienteError) {
        return erro(reply, 403, error.message, "INSUFFICIENT_PERMISSION", { permissao: error.permissao });
      }
      return erro(reply, 400, error instanceof Error ? error.message : "Retirada invalida");
    }
  });
}



