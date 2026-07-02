import { mensagemDominioOuRelancar } from "../erros.js";
import type { FastifyInstance } from "fastify";
import {
  contaParamsSchema as idParamsSchema,
  contasQuerySchema as empresaQuerySchema,
  exportarContaSchema as exportarPayloadSchema,
  importarContasSchema as importarPayloadSchema
} from "@padaria/shared/contas";
import { criadoId, erro, ok, paginadoDeArray, semConteudo } from "@padaria/shared/api";
import { exigirPermissao } from "../auth/guards.js";
import { escopoEmpresaAtiva, empresasPermitidas, podeAcessarEmpresa } from "../auth/empresa.js";
import { statusErroValidacao } from "../utils.js";
import { exportarConta, importarContas, listarContas, salvarConta } from "./contas.service.js";

export async function registrarRotasContas(app: FastifyInstance): Promise<void> {
  app.get("/api/contas", { preHandler: exigirPermissao("cadastro_contas_visualizar") }, async (request, reply) => {
    const query = empresaQuerySchema.parse(request.query);
    try {
      const escopo = escopoEmpresaAtiva(
        request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : [],
        query.empresaId
      );
      return paginadoDeArray(await listarContas(escopo), query.page, query.pageSize);
    } catch (error) {
      return erro(reply, 403, mensagemDominioOuRelancar(error), "FORBIDDEN_COMPANY");
    }
  });

  app.post("/api/contas", { preHandler: exigirPermissao("cadastro_contas_criar") }, async (request, reply) => {
    const body = request.body as { empresaId?: string };
    if (body.empresaId && request.perfilUsuario && !podeAcessarEmpresa(request.perfilUsuario, body.empresaId))
      return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
    try {
      const salvo = await salvarConta(null, request.body);
      return criadoId(reply, salvo?.id ?? "contas");
    } catch (error) {
      const mensagem = mensagemDominioOuRelancar(error);
      return erro(reply, statusErroValidacao(mensagem), mensagem);
    }
  });

  app.put("/api/contas/:id", { preHandler: exigirPermissao("cadastro_contas_editar") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { empresaId?: string };
    if (body.empresaId && request.perfilUsuario && !podeAcessarEmpresa(request.perfilUsuario, body.empresaId))
      return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
    try {
      await salvarConta(id, request.body);
      return semConteudo(reply);
    } catch (error) {
      const mensagem = mensagemDominioOuRelancar(error);
      return erro(reply, statusErroValidacao(mensagem), mensagem);
    }
  });

  app.post("/api/contas/importar", { preHandler: exigirPermissao("cadastro_contas_criar") }, async (request, reply) => {
    try {
      return ok(await importarContas(importarPayloadSchema.parse(request.body), request.perfilUsuario));
    } catch (error) {
      const mensagem = mensagemDominioOuRelancar(error);
      return erro(reply, mensagem === "Empresa nao permitida" ? 403 : 400, mensagem);
    }
  });

  app.post(
    "/api/contas/:id/exportar",
    { preHandler: exigirPermissao("cadastro_contas_criar") },
    async (request, reply) => {
      const { id } = idParamsSchema.parse(request.params);
      try {
        return ok(await exportarConta(id, exportarPayloadSchema.parse(request.body), request.perfilUsuario));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, mensagem === "Empresa nao permitida" ? 403 : 400, mensagem);
      }
    }
  );
}
