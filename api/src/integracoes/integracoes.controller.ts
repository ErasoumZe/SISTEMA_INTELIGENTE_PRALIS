import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  atualizarCampoIntegracaoPayloadSchema,
  criarIntegracaoChavePayloadSchema,
  integracaoChaveParamsSchema,
  integracaoCodigoParamsSchema,
  integracaoQuerySchema,
  salvarVinculoIntegracaoPayloadSchema,
  tiposIntegracao,
  vendaIntegracaoAgregadaSchema,
  type VendaIntegracaoAgregadaPayload
} from "@padaria/shared/integracoes";
import { exigirPermissao } from "../autorizacao.js";
import { criadoId, erro, ok, paginadoDeArray, semConteudo } from "../respostas.js";
import {
  criarChaveIntegracao,
  inativarChaveIntegracao,
  listarDicionarioIntegracao,
  listarHistoricoIntegracao,
  listarIntegracoes,
  receberVendaIntegracao,
  salvarCampoIntegracao,
  salvarVinculoIntegracao
} from "./integracoes.service.js";

const dicionarioQuerySchema = integracaoQuerySchema.extend({
  empresaId: z.string().uuid(),
  tipo: z.enum(tiposIntegracao)
});

export async function registrarRotasIntegracoes(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/integracoes",
    { preHandler: exigirPermissao("integracoes") },
    async (request) => ok(await listarIntegracoes(integracaoQuerySchema.parse(request.query), request.perfilUsuario!))
  );

  app.get(
    "/api/integracoes/historico",
    { preHandler: exigirPermissao("integracoes") },
    async (request) => {
      const query = integracaoQuerySchema.parse(request.query);
      return paginadoDeArray(await listarHistoricoIntegracao(query, request.perfilUsuario!), query.page, query.pageSize);
    }
  );

  app.get(
    "/api/integracoes/dicionario",
    { preHandler: exigirPermissao("integracoes") },
    async (request) => ok(await listarDicionarioIntegracao(dicionarioQuerySchema.parse(request.query), request.perfilUsuario!))
  );

  app.post(
    "/api/integracoes/chaves",
    { preHandler: exigirPermissao("integracoes") },
    async (request, reply) => {
      try {
        const chave = await criarChaveIntegracao(criarIntegracaoChavePayloadSchema.parse(request.body), request.perfilUsuario!);
        if (!chave) return erro(reply, 400, "Integracao invalida");
        return criadoId(reply, chave.id);
      } catch (error) {
        const mensagem = error instanceof Error ? error.message : "Integracao invalida";
        return erro(reply, mensagem === "Empresa nao permitida" ? 403 : 400, mensagem);
      }
    }
  );

  app.post(
    "/api/integracoes/chaves/:id/inativar",
    { preHandler: exigirPermissao("integracoes") },
    async (request, reply) => {
      const { id } = integracaoChaveParamsSchema.parse(request.params);
      try {
        await inativarChaveIntegracao(id, request.perfilUsuario!);
        return semConteudo(reply);
      } catch (error) {
        const mensagem = error instanceof Error ? error.message : "Integracao invalida";
        return erro(reply, mensagem === "Empresa nao permitida" ? 403 : 400, mensagem);
      }
    }
  );

  app.put(
    "/api/integracoes/campos",
    { preHandler: exigirPermissao("integracoes") },
    async (request, reply) => {
      try {
        await salvarCampoIntegracao(atualizarCampoIntegracaoPayloadSchema.parse(request.body), request.perfilUsuario!);
        return semConteudo(reply);
      } catch (error) {
        const mensagem = error instanceof Error ? error.message : "Integracao invalida";
        return erro(reply, mensagem === "Empresa nao permitida" ? 403 : 400, mensagem);
      }
    }
  );

  app.put(
    "/api/integracoes/vinculos",
    { preHandler: exigirPermissao("integracoes") },
    async (request, reply) => {
      try {
        await salvarVinculoIntegracao(salvarVinculoIntegracaoPayloadSchema.parse(request.body), request.perfilUsuario!);
        return semConteudo(reply);
      } catch (error) {
        const mensagem = error instanceof Error ? error.message : "Integracao invalida";
        return erro(reply, mensagem === "Empresa nao permitida" ? 403 : 400, mensagem);
      }
    }
  );

  app.post("/api/integracoes/:codigo", async (request, reply) => {
    const { codigo } = integracaoCodigoParamsSchema.parse(request.params);
    const payload: VendaIntegracaoAgregadaPayload = vendaIntegracaoAgregadaSchema.parse(request.body);
    try {
      return ok(await receberVendaIntegracao(codigo, payload));
    } catch (error) {
      const mensagem = error instanceof Error ? error.message : "Integracao invalida";
      const status = mensagem === "Chave de integracao invalida" ? 401 : 400;
      return erro(reply, status, mensagem);
    }
  });
}
