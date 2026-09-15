import type { FastifyInstance } from "fastify";
import { socioGestorPayloadSchema, sociosGestoresQuerySchema } from "@padaria/shared/socios-gestores";
import { criadoId, erro, paginadoDeArray, semConteudo } from "@padaria/shared/api";
import { exigirAlgumaPermissao, exigirPermissao } from "../auth/guards.js";
import { escopoEmpresaAtiva, empresasPermitidas, podeAcessarEmpresa } from "../auth/empresa.js";
import { mensagemDominioOuRelancar } from "../erros.js";
import { statusErroValidacao } from "../utils.js";
import { listarSociosGestores, salvarSocioGestor } from "./socios-gestores.service.js";

export async function registrarRotasSociosGestores(app: FastifyInstance) {
  app.get(
    "/api/socios-gestores",
    { preHandler: exigirPermissao("cadastro_socios_gestores_visualizar") },
    async (request, reply) => {
      const query = sociosGestoresQuerySchema.parse(request.query);
      try {
        const escopo = escopoEmpresaAtiva(
          request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : [],
          query.empresaId
        );
        return paginadoDeArray(await listarSociosGestores(escopo, false), query.page, query.pageSize);
      } catch (error) {
        return erro(reply, 403, mensagemDominioOuRelancar(error), "FORBIDDEN_COMPANY");
      }
    }
  );

  // A retirada continua precisando escolher quem recebe, mas isso nao concede acesso ao cadastro
  // de Socios e Gestores. Esta rota devolve somente ativos e fica separada do CRUD administrativo.
  app.get(
    "/api/socios-gestores/opcoes",
    { preHandler: exigirAlgumaPermissao(["retiradas_visualizar", "retiradas_criar", "retiradas_editar"]) },
    async (request, reply) => {
      const query = sociosGestoresQuerySchema.parse(request.query);
      try {
        const escopo = escopoEmpresaAtiva(
          request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : [],
          query.empresaId
        );
        return paginadoDeArray(await listarSociosGestores(escopo, true), query.page, query.pageSize);
      } catch (error) {
        return erro(reply, 403, mensagemDominioOuRelancar(error), "FORBIDDEN_COMPANY");
      }
    }
  );

  app.post(
    "/api/socios-gestores",
    { preHandler: exigirPermissao("cadastro_socios_gestores_criar") },
    async (request, reply) => {
      const dados = socioGestorPayloadSchema.parse(request.body);
      if (!request.perfilUsuario || !podeAcessarEmpresa(request.perfilUsuario, dados.empresaId))
        return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
      try {
        return criadoId(reply, (await salvarSocioGestor(null, dados)).id);
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErroValidacao(mensagem), mensagem);
      }
    }
  );

  app.put(
    "/api/socios-gestores/:id",
    { preHandler: exigirPermissao("cadastro_socios_gestores_editar") },
    async (request, reply) => {
      const dados = socioGestorPayloadSchema.parse(request.body);
      const { id } = request.params as { id: string };
      if (!request.perfilUsuario || !podeAcessarEmpresa(request.perfilUsuario, dados.empresaId))
        return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
      try {
        await salvarSocioGestor(id, dados);
        return semConteudo(reply);
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErroValidacao(mensagem), mensagem);
      }
    }
  );
}
