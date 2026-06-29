import type { FastifyInstance } from "fastify";
import { empresasQuerySchema as empresaQuerySchema } from "@padaria/shared/empresas";
import { criadoId, erro, paginadoDeArray, semConteudo } from "@padaria/shared/api";
import { exigirPermissao } from "../auth/guards.js";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import { statusErroValidacao } from "../utils.js";
import { listarEmpresas, salvarEmpresa } from "./empresas.service.js";

export async function registrarRotasEmpresas(app: FastifyInstance): Promise<void> {
  app.get("/api/empresas", { preHandler: exigirPermissao("cadastro_empresas_visualizar") }, async (request) => {
    const query = empresaQuerySchema.parse(request.query);
    return paginadoDeArray(await listarEmpresas(request.perfilUsuario), query.page, query.pageSize);
  });

  app.post("/api/empresas", { preHandler: exigirPermissao("cadastro_empresas_criar") }, async (request, reply) => {
    try {
      const salvo = await salvarEmpresa(null, request.body);
      return criadoId(reply, salvo?.id ?? "empresas");
    } catch (error) {
      const mensagem = error instanceof Error ? error.message : "Dados invalidos";
      return erro(reply, statusErroValidacao(mensagem), mensagem);
    }
  });

  app.put("/api/empresas/:id", { preHandler: exigirPermissao("cadastro_empresas_editar") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    if (request.perfilUsuario && !podeAcessarEmpresa(request.perfilUsuario, id)) {
      return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
    }
    try {
      await salvarEmpresa(id, request.body);
      return semConteudo(reply);
    } catch (error) {
      const mensagem = error instanceof Error ? error.message : "Dados invalidos";
      return erro(reply, statusErroValidacao(mensagem), mensagem);
    }
  });
}
