import type { FastifyInstance } from "fastify";
import { mercadoriaPayloadSchema, mercadoriasQuerySchema } from "@padaria/shared/mercadorias";
import { exigirAutenticacao } from "../autorizacao.js";
import { empresasPermitidas, escopoEmpresaAtiva, podeAcessarEmpresa } from "../autorizacao/empresa.js";
import { criadoId, erro, paginadoDeArray } from "../respostas.js";
import { PermissaoLancamentoInsuficienteError } from "../lancamentos/service-utils.js";
import { criarMercadoria, listarMercadorias } from "./mercadorias.service.js";

export async function registrarRotasMercadorias(app: FastifyInstance): Promise<void> {
  app.get("/api/mercadorias", { preHandler: exigirAutenticacao }, async (request, reply) => {
    const query = mercadoriasQuerySchema.parse(request.query);
    const empresasLiberadas = request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : [];
    let escopoDados: string[] | null;
    try {
      escopoDados = escopoEmpresaAtiva(empresasLiberadas, query.empresaId);
    } catch {
      return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
    }
    return paginadoDeArray(await listarMercadorias(query, escopoDados), query.page, query.pageSize);
  });

  app.post("/api/mercadorias", async (request, reply) => {
    const dados = mercadoriaPayloadSchema.parse(request.body);
    const perfil = await exigirAutenticacao(request, reply);
    if (!perfil) return;
    if (!podeAcessarEmpresa(perfil, dados.empresaId)) {
      return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
    }
    try {
      const mercadoria = await criarMercadoria(dados, perfil);
      return criadoId(reply, mercadoria.id);
    } catch (error) {
      if (error instanceof PermissaoLancamentoInsuficienteError) {
        return erro(reply, 403, error.message, "INSUFFICIENT_PERMISSION", { permissao: error.permissao });
      }
      return erro(reply, 400, error instanceof Error ? error.message : "Mercadoria invalida");
    }
  });
}
