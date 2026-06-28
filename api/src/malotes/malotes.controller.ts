import type { FastifyInstance } from "fastify";
import { exigirPermissao } from "../autorizacao.js";
import { escopoEmpresaAtiva, empresasPermitidas, podeAcessarEmpresa } from "../autorizacao/empresa.js";
import {
  atualizarMalote,
  criarMalote,
  listarLacresMalote,
  listarMalotes,
  mensagemErroMalote,
  validarLacre
} from "./malotes.service.js";
import {
  atualizarMaloteSchema,
  criarMaloteSchema,
  malotesQuerySchema,
  maloteParamsSchema,
  validarLacreQuerySchema
} from "@padaria/shared/malotes";

export async function registrarRotasMalotes(app: FastifyInstance): Promise<void> {
  app.get("/api/malotes", { preHandler: exigirPermissao("cadastro_malotes") }, async (request, reply) => {
    const query = malotesQuerySchema.parse(request.query);
    const empresasLiberadas = request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : [];
    try {
      return await listarMalotes(escopoEmpresaAtiva(empresasLiberadas, query.empresaId));
    } catch (error) {
      return reply.status(403).send({ erro: error instanceof Error ? error.message : "Empresa nao permitida" });
    }
  });

  app.get("/api/malotes/:maloteId/lacres", { preHandler: exigirPermissao("transferencias") }, async (request) => {
    const { maloteId } = maloteParamsSchema.parse(request.params);
    return listarLacresMalote(maloteId, request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : []);
  });

  app.get("/api/lacres/validar", { preHandler: exigirPermissao("transferencias") }, async (request, reply) => {
    const { numero, empresaId } = validarLacreQuerySchema.parse(request.query);
    const empresasLiberadas = request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : [];
    try {
      return validarLacre(numero, escopoEmpresaAtiva(empresasLiberadas, empresaId));
    } catch (error) {
      return reply.status(403).send({ erro: error instanceof Error ? error.message : "Empresa nao permitida" });
    }
  });

  app.post("/api/malotes", { preHandler: exigirPermissao("cadastro_malotes") }, async (request, reply) => {
    const body = criarMaloteSchema.parse(request.body);
    if (request.perfilUsuario && !podeAcessarEmpresa(request.perfilUsuario, body.empresaId)) {
      return reply.status(403).send({ erro: "Empresa nao permitida" });
    }

    try {
      return await criarMalote(body, request.usuarioId);
    } catch (error) {
      return reply
        .status(400)
        .send({ erro: mensagemErroMalote(error instanceof Error ? error : new Error("Malote invalido")) });
    }
  });

  app.put("/api/malotes/:maloteId", { preHandler: exigirPermissao("cadastro_malotes") }, async (request, reply) => {
    const { maloteId } = maloteParamsSchema.parse(request.params);
    const body = atualizarMaloteSchema.parse(request.body);

    try {
      return await atualizarMalote(
        maloteId,
        body,
        request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : []
      );
    } catch (error) {
      const mensagem = mensagemErroMalote(error instanceof Error ? error : new Error("Malote invalido"));
      if (mensagem === "Empresa nao permitida") return reply.status(403).send({ erro: mensagem });
      return reply.status(400).send({ erro: mensagem });
    }
  });
}
