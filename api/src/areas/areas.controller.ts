import { mensagemDominioOuRelancar } from "../erros.js";
import type { FastifyInstance } from "fastify";
import {
  areaSetorParamsSchema as idParamsSchema,
  areasQuerySchema as empresaQuerySchema,
  exportarAreaSetorSchema as exportarPayloadSchema,
  importarAreasSetoresSchema as importarPayloadSchema
} from "@padaria/shared/areas";
import { criadoId, erro, ok, paginadoDeArray, semConteudo } from "@padaria/shared/api";
import { exigirPermissao } from "../auth/guards.js";
import { escopoEmpresaAtiva, empresasPermitidas, podeAcessarEmpresa } from "../auth/empresa.js";
import { statusErroValidacao } from "../utils.js";
import {
  exportarAreaSetor,
  importarAreasSetores,
  listarAreas,
  listarAreasSetores,
  salvarArea
} from "./areas.service.js";

export async function registrarRotasAreas(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/areas",
    { preHandler: exigirPermissao("cadastro_areas_setores_visualizar") },
    async (request, reply) => {
      const query = empresaQuerySchema.parse(request.query);
      try {
        const escopo = escopoEmpresaAtiva(
          request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : [],
          query.empresaId
        );
        return paginadoDeArray(await listarAreas(escopo), query.page, query.pageSize);
      } catch (error) {
        return erro(reply, 403, mensagemDominioOuRelancar(error), "FORBIDDEN_COMPANY");
      }
    }
  );

  app.get(
    "/api/areas_setores",
    { preHandler: exigirPermissao("cadastro_areas_setores_visualizar") },
    async (request, reply) => {
      const query = empresaQuerySchema.parse(request.query);
      try {
        const escopo = escopoEmpresaAtiva(
          request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : [],
          query.empresaId
        );
        return ok(await listarAreasSetores(escopo));
      } catch (error) {
        return erro(reply, 403, mensagemDominioOuRelancar(error), "FORBIDDEN_COMPANY");
      }
    }
  );

  app.post("/api/areas", { preHandler: exigirPermissao("cadastro_areas_setores_criar") }, async (request, reply) => {
    const body = request.body as { empresaId?: string };
    if (body.empresaId && request.perfilUsuario && !podeAcessarEmpresa(request.perfilUsuario, body.empresaId))
      return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
    try {
      const salvo = await salvarArea(null, request.body);
      return criadoId(reply, salvo?.id ?? "areas");
    } catch (error) {
      const mensagem = mensagemDominioOuRelancar(error);
      return erro(reply, statusErroValidacao(mensagem), mensagem);
    }
  });

  app.put(
    "/api/areas/:id",
    { preHandler: exigirPermissao("cadastro_areas_setores_editar") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as { empresaId?: string };
      if (body.empresaId && request.perfilUsuario && !podeAcessarEmpresa(request.perfilUsuario, body.empresaId))
        return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
      try {
        await salvarArea(id, request.body);
        return semConteudo(reply);
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErroValidacao(mensagem), mensagem);
      }
    }
  );

  app.post(
    "/api/areas-setores/importar",
    { preHandler: exigirPermissao("cadastro_areas_setores_criar") },
    async (request, reply) => {
      try {
        return ok(await importarAreasSetores(importarPayloadSchema.parse(request.body), request.perfilUsuario));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, mensagem === "Empresa nao permitida" ? 403 : 400, mensagem);
      }
    }
  );

  app.post(
    "/api/areas-setores/:id/exportar",
    { preHandler: exigirPermissao("cadastro_areas_setores_criar") },
    async (request, reply) => {
      const { id } = idParamsSchema.parse(request.params);
      try {
        return ok(await exportarAreaSetor(id, exportarPayloadSchema.parse(request.body), request.perfilUsuario));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, mensagem === "Empresa nao permitida" ? 403 : 400, mensagem);
      }
    }
  );
}
