import type { FastifyInstance } from "fastify";
import { lacrePayloadSchema, lacresQuerySchema } from "@padaria/shared/lacres";
import { criadoId, erro, ok } from "@padaria/shared/api";
import { escopoEmpresaAtiva, empresasPermitidas, podeAcessarEmpresa } from "../auth/empresa.js";
import { exigirPermissao } from "../auth/guards.js";
import { mensagemDominioOuRelancar } from "../erros.js";
import { statusErroValidacao } from "../utils.js";
import { criarLacre, listarLacres } from "./lacres.service.js";

export async function registrarRotasLacres(app: FastifyInstance): Promise<void> {
  app.get("/api/lacres", { preHandler: exigirPermissao("cadastro_lacres_visualizar") }, async (request, reply) => {
    const query = lacresQuerySchema.parse(request.query);
    try {
      const escopo = escopoEmpresaAtiva(
        request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : [],
        query.empresaId
      );
      return ok(
        await listarLacres({
          empresasPermitidas: escopo,
          ...(query.transferenciaId ? { transferenciaId: query.transferenciaId } : {}),
          ...(query.origem ? { origem: query.origem } : {})
        })
      );
    } catch (error) {
      return erro(reply, 403, mensagemDominioOuRelancar(error), "FORBIDDEN_COMPANY");
    }
  });

  app.post("/api/lacres", { preHandler: exigirPermissao("cadastro_lacres_criar") }, async (request, reply) => {
    const body = lacrePayloadSchema.parse(request.body);
    if (request.perfilUsuario && !podeAcessarEmpresa(request.perfilUsuario, body.empresaId))
      return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
    try {
      const salvo = await criarLacre(body);
      return criadoId(reply, salvo.id);
    } catch (error) {
      const mensagem = mensagemDominioOuRelancar(error);
      return erro(reply, statusErroValidacao(mensagem), mensagem);
    }
  });
}
