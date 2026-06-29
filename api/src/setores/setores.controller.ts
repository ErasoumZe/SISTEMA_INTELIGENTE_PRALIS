import type { FastifyInstance } from "fastify";
import { setoresQuerySchema as empresaQuerySchema } from "@padaria/shared/setores";
import { criadoId, erro, paginadoDeArray, semConteudo } from "@padaria/shared/api";
import { exigirPermissao } from "../auth/guards.js";
import { escopoEmpresaAtiva, empresasPermitidas, podeAcessarEmpresa } from "../auth/empresa.js";
import { statusErroValidacao } from "../utils.js";
import { listarSetores, salvarSetor } from "./setores.service.js";

export async function registrarRotasSetores(app: FastifyInstance): Promise<void> {
  app.get("/api/setores", { preHandler: exigirPermissao("cadastro_areas_setores_visualizar") }, async (request, reply) => {
    const query = empresaQuerySchema.parse(request.query);
    try {
      const escopo = escopoEmpresaAtiva(request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : [], query.empresaId);
      return paginadoDeArray(await listarSetores(escopo), query.page, query.pageSize);
    } catch (error) {
      return erro(reply, 403, error instanceof Error ? error.message : "Empresa nao permitida", "FORBIDDEN_COMPANY");
    }
  });

  app.post("/api/setores", { preHandler: exigirPermissao("cadastro_areas_setores_criar") }, async (request, reply) => {
    const body = request.body as { empresaId?: string };
    if (body.empresaId && request.perfilUsuario && !podeAcessarEmpresa(request.perfilUsuario, body.empresaId)) return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
    try {
      const salvo = await salvarSetor(null, request.body);
      return criadoId(reply, salvo?.id ?? "setores");
    } catch (error) {
      const mensagem = error instanceof Error ? error.message : "Dados invalidos";
      return erro(reply, statusErroValidacao(mensagem), mensagem);
    }
  });

  app.put("/api/setores/:id", { preHandler: exigirPermissao("cadastro_areas_setores_editar") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { empresaId?: string };
    if (body.empresaId && request.perfilUsuario && !podeAcessarEmpresa(request.perfilUsuario, body.empresaId)) return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
    try {
      await salvarSetor(id, request.body);
      return semConteudo(reply);
    } catch (error) {
      const mensagem = error instanceof Error ? error.message : "Dados invalidos";
      return erro(reply, statusErroValidacao(mensagem), mensagem);
    }
  });
}
