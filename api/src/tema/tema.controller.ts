import { exigirAutenticacao, exigirPermissao } from "../autorizacao.js";
import { podeAcessarEmpresa } from "../autorizacao/empresa.js";
import type { AplicacaoFastify } from "../tipos/fastify.js";
import { atualizarTema, carregarTema } from "./tema.service.js";
import { temaPayloadSchema, temaQuerySchema } from "@padaria/shared/tema";

export async function registrarRotasTema(app: AplicacaoFastify) {
  app.get("/api/tema", { preHandler: exigirAutenticacao }, async (request, reply) => {
    const query = temaQuerySchema.parse(request.query);
    if (request.perfilUsuario && !podeAcessarEmpresa(request.perfilUsuario, query.empresaId)) {
      return reply.status(403).send({ erro: "Empresa nao permitida" });
    }
    return carregarTema(query);
  });

  app.put("/api/tema", { preHandler: exigirPermissao("configurar_tema") }, async (request, reply) => {
    const body = temaPayloadSchema.parse(request.body);
    if (request.perfilUsuario && !podeAcessarEmpresa(request.perfilUsuario, body.empresaId)) {
      return reply.status(403).send({ erro: "Empresa nao permitida" });
    }
    return atualizarTema(body, request.usuarioId);
  });
}
