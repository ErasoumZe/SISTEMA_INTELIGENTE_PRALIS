import { exigirAutenticacao, exigirPermissao } from "../autorizacao.js";
import { podeAcessarEmpresa } from "../autorizacao/empresa.js";
import { erro, ok, semConteudo } from "../respostas.js";
import type { AplicacaoFastify } from "../tipos/fastify.js";
import { atualizarTema, carregarTema } from "./tema.service.js";
import { temaPayloadSchema, temaQuerySchema } from "@padaria/shared/tema";

export async function registrarRotasTema(app: AplicacaoFastify) {
  app.get("/api/tema", { preHandler: exigirAutenticacao }, async (request, reply) => {
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
