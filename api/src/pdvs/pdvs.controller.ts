import type { FastifyInstance } from "fastify";
import { pdvsQuerySchema as empresaQuerySchema } from "@padaria/shared/pdvs";
import { criadoId, erro, paginadoDeArray, semConteudo } from "@padaria/shared/api";
import { exigirAlgumaPermissao, exigirPermissao } from "../auth/guards.js";
import { escopoEmpresaAtiva, empresasPermitidas, podeAcessarEmpresa } from "../auth/empresa.js";
import { statusErroValidacao } from "../utils.js";
import { listarPdvs, salvarPdv } from "./pdvs.service.js";

export async function registrarRotasPdvs(app: FastifyInstance): Promise<void> {
  app.get("/api/pdvs", { preHandler: exigirAlgumaPermissao(["cadastro_pdv_visualizar", "caixa_operar"]) }, async (request, reply) => {
    const query = empresaQuerySchema.parse(request.query);
    try {
      const escopo = escopoEmpresaAtiva(request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : [], query.empresaId);
      return paginadoDeArray(await listarPdvs(escopo), query.page, query.pageSize);
    } catch (error) {
      return erro(reply, 403, error instanceof Error ? error.message : "Empresa nao permitida", "FORBIDDEN_COMPANY");
    }
  });

  app.post("/api/pdvs", { preHandler: exigirPermissao("cadastro_pdv_criar") }, async (request, reply) => {
    const body = request.body as { empresaId?: string };
    if (body.empresaId && request.perfilUsuario && !podeAcessarEmpresa(request.perfilUsuario, body.empresaId)) {
      return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
    }
    try {
      const salvo = await salvarPdv(null, request.body);
      return criadoId(reply, salvo?.id ?? "pdvs");
    } catch (error) {
      const mensagem = error instanceof Error ? error.message : "Dados invalidos";
      return erro(reply, statusErroValidacao(mensagem), mensagem);
    }
  });

  app.put("/api/pdvs/:id", { preHandler: exigirPermissao("cadastro_pdv_editar") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { empresaId?: string };
    if (body.empresaId && request.perfilUsuario && !podeAcessarEmpresa(request.perfilUsuario, body.empresaId)) {
      return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
    }
    try {
      await salvarPdv(id, request.body);
      return semConteudo(reply);
    } catch (error) {
      const mensagem = error instanceof Error ? error.message : "Dados invalidos";
      return erro(reply, statusErroValidacao(mensagem), mensagem);
    }
  });
}
