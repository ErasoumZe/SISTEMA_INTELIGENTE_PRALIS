import { mensagemDominioOuRelancar } from "../erros.js";
import type { FastifyInstance } from "fastify";
import {
  exportarUnidadeMedidaSchema as exportarPayloadSchema,
  importarUnidadesMedidaSchema as importarPayloadSchema,
  unidadeMedidaParamsSchema as idParamsSchema,
  unidadesMedidaQuerySchema as empresaQuerySchema
} from "@padaria/shared/unidades-medida";
import { criadoId, erro, ok, paginadoDeArray, semConteudo } from "@padaria/shared/api";
import { exigirAlgumaPermissao, exigirPermissao } from "../auth/guards.js";
import { escopoEmpresaAtiva, empresasPermitidas, podeAcessarEmpresa } from "../auth/empresa.js";
import { statusErroValidacao } from "../utils.js";
import {
  exportarUnidadeMedida,
  importarUnidadesMedida,
  listarUnidadesMedida,
  salvarUnidadeMedida
} from "./unidades-medida.service.js";

export async function registrarRotasUnidadesMedida(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/unidades_medida",
    {
      // A mesma lista reduzida alimenta o formulario de Produto. Consultar id/nome/sigla para
      // criar ou editar um produto nao concede acesso ao cadastro administrativo de unidades.
      preHandler: exigirAlgumaPermissao([
        "cadastro_unidades_medida_visualizar",
        "cadastro_produtos_criar",
        "cadastro_produtos_editar"
      ])
    },
    async (request, reply) => {
      const query = empresaQuerySchema.parse(request.query);
      try {
        const escopo = escopoEmpresaAtiva(
          request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : [],
          query.empresaId
        );
        return paginadoDeArray(await listarUnidadesMedida(escopo), query.page, query.pageSize);
      } catch (error) {
        return erro(reply, 403, mensagemDominioOuRelancar(error), "FORBIDDEN_COMPANY");
      }
    }
  );

  app.post(
    "/api/unidades-medida",
    { preHandler: exigirPermissao("cadastro_unidades_medida_criar") },
    async (request, reply) => {
      const body = request.body as { empresaId?: string };
      if (body.empresaId && request.perfilUsuario && !podeAcessarEmpresa(request.perfilUsuario, body.empresaId))
        return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
      try {
        const salvo = await salvarUnidadeMedida(null, request.body);
        return criadoId(reply, salvo?.id ?? "unidades-medida");
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErroValidacao(mensagem), mensagem);
      }
    }
  );

  app.put(
    "/api/unidades-medida/:id",
    { preHandler: exigirPermissao("cadastro_unidades_medida_editar") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as { empresaId?: string };
      if (body.empresaId && request.perfilUsuario && !podeAcessarEmpresa(request.perfilUsuario, body.empresaId))
        return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
      try {
        await salvarUnidadeMedida(id, request.body);
        return semConteudo(reply);
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErroValidacao(mensagem), mensagem);
      }
    }
  );

  app.post(
    "/api/unidades-medida/importar",
    { preHandler: exigirPermissao("cadastro_unidades_medida_criar") },
    async (request, reply) => {
      try {
        return ok(await importarUnidadesMedida(importarPayloadSchema.parse(request.body), request.perfilUsuario));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, mensagem === "Empresa nao permitida" ? 403 : 400, mensagem);
      }
    }
  );

  app.post(
    "/api/unidades-medida/:id/exportar",
    { preHandler: exigirPermissao("cadastro_unidades_medida_criar") },
    async (request, reply) => {
      const { id } = idParamsSchema.parse(request.params);
      try {
        return ok(await exportarUnidadeMedida(id, exportarPayloadSchema.parse(request.body), request.perfilUsuario));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, mensagem === "Empresa nao permitida" ? 403 : 400, mensagem);
      }
    }
  );
}
