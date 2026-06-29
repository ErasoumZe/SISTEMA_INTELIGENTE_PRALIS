import type { FastifyInstance } from "fastify";
import { exigirPermissao } from "../auth/guards.js";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import { erro, ok, semConteudo } from "@padaria/shared/api";
import { atualizarTema, carregarTema } from "./tema.service.js";
import { temaPayloadSchema, temaQuerySchema } from "@padaria/shared/tema";

export async function registrarRotasTema(app: FastifyInstance) {
  app.get("/api/tema", { preHandler: exigirPermissao("aparencia_visualizar") }, async (request, reply) => {
    const query = temaQuerySchema.parse(request.query);
    if (request.perfilUsuario && !podeAcessarEmpresa(request.perfilUsuario, query.empresaId)) {
      return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
    }
    return ok(await carregarTema(query));
  });

  app.put("/api/tema", { preHandler: exigirPermissao("aparencia_editar") }, async (request, reply) => {
    const body = temaPayloadSchema.parse(request.body);
    if (request.perfilUsuario && !podeAcessarEmpresa(request.perfilUsuario, body.empresaId)) {
      return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
    }
    await atualizarTema(body, request.usuarioId);
    return semConteudo(reply);
  });
}


