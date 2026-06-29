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
    async (request) => listarIntegracoes(integracaoQuerySchema.parse(request.query), request.perfilUsuario!)
  );

  app.get(
    "/api/integracoes/historico",
    { preHandler: exigirPermissao("integracoes") },
    async (request) => listarHistoricoIntegracao(integracaoQuerySchema.parse(request.query), request.perfilUsuario!)
  );

  app.get(
    "/api/integracoes/dicionario",
    { preHandler: exigirPermissao("integracoes") },
    async (request) => listarDicionarioIntegracao(dicionarioQuerySchema.parse(request.query), request.perfilUsuario!)
  );

  app.post(
    "/api/integracoes/chaves",
    { preHandler: exigirPermissao("integracoes") },
    async (request, reply) => {
      try {
        return await criarChaveIntegracao(criarIntegracaoChavePayloadSchema.parse(request.body), request.perfilUsuario!);
      } catch (error) {
        const mensagem = error instanceof Error ? error.message : "Integracao invalida";
        return reply.status(mensagem === "Empresa nao permitida" ? 403 : 400).send({ erro: mensagem });
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
        return { ok: true };
      } catch (error) {
        const mensagem = error instanceof Error ? error.message : "Integracao invalida";
        return reply.status(mensagem === "Empresa nao permitida" ? 403 : 400).send({ erro: mensagem });
      }
    }
  );

  app.put(
    "/api/integracoes/campos",
    { preHandler: exigirPermissao("integracoes") },
    async (request, reply) => {
      try {
        return await salvarCampoIntegracao(atualizarCampoIntegracaoPayloadSchema.parse(request.body), request.perfilUsuario!);
      } catch (error) {
        const mensagem = error instanceof Error ? error.message : "Integracao invalida";
        return reply.status(mensagem === "Empresa nao permitida" ? 403 : 400).send({ erro: mensagem });
      }
    }
  );

  app.put(
    "/api/integracoes/vinculos",
    { preHandler: exigirPermissao("integracoes") },
    async (request, reply) => {
      try {
        return await salvarVinculoIntegracao(salvarVinculoIntegracaoPayloadSchema.parse(request.body), request.perfilUsuario!);
      } catch (error) {
        const mensagem = error instanceof Error ? error.message : "Integracao invalida";
        return reply.status(mensagem === "Empresa nao permitida" ? 403 : 400).send({ erro: mensagem });
      }
    }
  );

  app.post("/api/integracoes/:codigo", async (request, reply) => {
    const { codigo } = integracaoCodigoParamsSchema.parse(request.params);
    const payload: VendaIntegracaoAgregadaPayload = vendaIntegracaoAgregadaSchema.parse(request.body);
    try {
      return await receberVendaIntegracao(codigo, payload);
    } catch (error) {
      const mensagem = error instanceof Error ? error.message : "Integracao invalida";
      const status = mensagem === "Chave de integracao invalida" ? 401 : 400;
      return reply.status(status).send({ erro: mensagem });
    }
  });
}
