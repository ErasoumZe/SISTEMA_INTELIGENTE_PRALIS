import type { FastifyInstance } from "fastify";
import { apiIdParamsSchema, erro, ok, paginadoDeArray } from "@padaria/shared/api";
import { importarNotasFiscaisPayloadSchema, notasFiscaisQuerySchema } from "@padaria/shared/notas-fiscais";
import { empresasPermitidas, escopoEmpresaAtiva, podeAcessarEmpresa } from "../auth/empresa.js";
import { exigirPermissao } from "../auth/guards.js";
import { mensagemDominioOuRelancar } from "../erros.js";
import { statusErroValidacao } from "../utils.js";
import { importarNotasFiscais, listarNotasFiscais, obterNotaFiscal } from "./notas-fiscais.service.js";

export async function registrarRotasNotasFiscais(app: FastifyInstance): Promise<void> {
  app.get("/api/notas-fiscais", { preHandler: exigirPermissao("notas_fiscais_visualizar") }, async (request, reply) => {
    const query = notasFiscaisQuerySchema.parse(request.query);
    const empresasLiberadas = request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : [];
    let escopoDados: string[];
    try {
      escopoDados = escopoEmpresaAtiva(empresasLiberadas, query.empresaId);
    } catch {
      return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
    }
    return paginadoDeArray(await listarNotasFiscais(query, escopoDados), query.page, query.pageSize);
  });

  app.get(
    "/api/notas-fiscais/:id",
    { preHandler: exigirPermissao("notas_fiscais_visualizar") },
    async (request, reply) => {
      const { id } = apiIdParamsSchema.parse(request.params);
      try {
        return ok(await obterNotaFiscal(id, request.perfilUsuario!));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErroValidacao(mensagem), mensagem);
      }
    }
  );

  app.post(
    "/api/notas-fiscais/importar",
    { preHandler: exigirPermissao("notas_fiscais_importar") },
    async (request, reply) => {
      const dados = importarNotasFiscaisPayloadSchema.parse(request.body);
      const perfil = request.perfilUsuario;
      if (!perfil) return erro(reply, 401, "Nao autenticado", "UNAUTHENTICATED");
      if (!podeAcessarEmpresa(perfil, dados.empresaId)) {
        return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
      }
      // Erros de dominio (empresa sem CNPJ, webhook nao configurado/indisponivel) sao estruturados
      // pelo servico e respondidos pelo error handler global.
      return ok(await importarNotasFiscais(dados, perfil));
    }
  );
}
