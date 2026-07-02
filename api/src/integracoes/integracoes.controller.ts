import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  atualizarCampoIntegracaoPayloadSchema,
  criarIntegracaoChavePayloadSchema,
  integracaoChaveParamsSchema,
  integracaoQuerySchema,
  salvarVinculoIntegracaoPayloadSchema,
  tiposIntegracao,
  vendaIntegracaoAgregadaSchema,
  type VendaIntegracaoAgregadaPayload
} from "@padaria/shared/integracoes";
import { exigirPermissao } from "../auth/guards.js";
import { criadoId, erro, ok, paginadoDeArray, semConteudo } from "@padaria/shared/api";
import { mensagemDominioOuRelancar, naoAutorizado } from "../erros.js";
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

function chaveIntegracaoHeader(headers: Record<string, string | string[] | undefined>): string | null {
  const apiKey = headers["x-api-key"];
  if (typeof apiKey === "string" && apiKey.trim()) return apiKey.trim();

  const authorization = headers["authorization"];
  if (typeof authorization !== "string") return null;
  const [tipo, token] = authorization.split(" ");
  if (tipo?.toLowerCase() !== "bearer" || !token?.trim()) return null;
  return token.trim();
}

export async function registrarRotasIntegracoes(app: FastifyInstance): Promise<void> {
  app.get("/api/integracoes", { preHandler: exigirPermissao("integracoes_visualizar") }, async (request) =>
    ok(await listarIntegracoes(integracaoQuerySchema.parse(request.query), request.perfilUsuario!))
  );

  app.get("/api/integracoes/historico", { preHandler: exigirPermissao("integracoes_visualizar") }, async (request) => {
    const query = integracaoQuerySchema.parse(request.query);
    return paginadoDeArray(await listarHistoricoIntegracao(query, request.perfilUsuario!), query.page, query.pageSize);
  });

  app.get("/api/integracoes/dicionario", { preHandler: exigirPermissao("integracoes_visualizar") }, async (request) =>
    ok(await listarDicionarioIntegracao(dicionarioQuerySchema.parse(request.query), request.perfilUsuario!))
  );

  app.post("/api/integracoes/chaves", { preHandler: exigirPermissao("integracoes_criar") }, async (request, reply) => {
    try {
      const chave = await criarChaveIntegracao(
        criarIntegracaoChavePayloadSchema.parse(request.body),
        request.perfilUsuario!
      );
      if (!chave) return erro(reply, 400, "Integracao invalida");
      return criadoId(reply, chave.id);
    } catch (error) {
      const mensagem = mensagemDominioOuRelancar(error);
      return erro(reply, mensagem === "Empresa nao permitida" ? 403 : 400, mensagem);
    }
  });

  app.post(
    "/api/integracoes/chaves/:id/inativar",
    { preHandler: exigirPermissao("integracoes_editar") },
    async (request, reply) => {
      const { id } = integracaoChaveParamsSchema.parse(request.params);
      try {
        await inativarChaveIntegracao(id, request.perfilUsuario!);
        return semConteudo(reply);
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, mensagem === "Empresa nao permitida" ? 403 : 400, mensagem);
      }
    }
  );

  app.put("/api/integracoes/campos", { preHandler: exigirPermissao("integracoes_editar") }, async (request, reply) => {
    try {
      await salvarCampoIntegracao(atualizarCampoIntegracaoPayloadSchema.parse(request.body), request.perfilUsuario!);
      return semConteudo(reply);
    } catch (error) {
      const mensagem = mensagemDominioOuRelancar(error);
      return erro(reply, mensagem === "Empresa nao permitida" ? 403 : 400, mensagem);
    }
  });

  app.put(
    "/api/integracoes/vinculos",
    { preHandler: exigirPermissao("integracoes_editar") },
    async (request, reply) => {
      try {
        await salvarVinculoIntegracao(salvarVinculoIntegracaoPayloadSchema.parse(request.body), request.perfilUsuario!);
        return semConteudo(reply);
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, mensagem === "Empresa nao permitida" ? 403 : 400, mensagem);
      }
    }
  );

  app.post(
    "/api/integracoes",
    {
      config: {
        rateLimit: {
          max: 30,
          timeWindow: "1 minute"
        }
      }
    },
    async (request) => {
      const chave = chaveIntegracaoHeader(request.headers);
      if (!chave) throw naoAutorizado("Chave de integracao invalida", "INVALID_INTEGRATION_KEY");
      const payload: VendaIntegracaoAgregadaPayload = vendaIntegracaoAgregadaSchema.parse(request.body);
      return ok(await receberVendaIntegracao(chave, payload));
    }
  );
}
