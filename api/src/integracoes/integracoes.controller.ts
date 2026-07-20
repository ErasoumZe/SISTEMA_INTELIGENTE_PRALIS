import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  atualizarCampoIntegracaoPayloadSchema,
  criarIntegracaoChavePayloadSchema,
  integracaoChaveParamsSchema,
  integracaoQuerySchema,
  salvarVinculoIntegracaoPayloadSchema,
  tiposIntegracao
} from "@padaria/shared/integracoes";
import { exigirPermissao } from "../auth/guards.js";
import { empresasPermitidas } from "../auth/empresa.js";
import { criadoId, erro, ok, paginadoDeArray, semConteudo } from "@padaria/shared/api";
import { mensagemDominioOuRelancar, naoAutorizado } from "../erros.js";
import {
  conciliarVendasDoDia,
  criarChaveIntegracao,
  inativarChaveIntegracao,
  listarDicionarioIntegracao,
  listarHistoricoIntegracao,
  listarIntegracoes,
  receberVendaIntegracao,
  salvarCampoIntegracao,
  salvarVinculoIntegracao,
  verificarSilencioIntegracao
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
    const perfil = request.perfilUsuario!;
    const pagina = paginadoDeArray(await listarHistoricoIntegracao(query, perfil), query.page, query.pageSize);
    // Best-effort, sem bloquear a resposta: se um dia fechou sem venda por integracao numa empresa
    // com chave ativa, avisa os admins (no maximo 1x/empresa/dia). Erros so vao para o log.
    const empresasParaVerificar = query.empresaId ? [query.empresaId] : empresasPermitidas(perfil);
    void verificarSilencioIntegracao({ empresaIds: empresasParaVerificar, hoje: new Date() }).catch((error) =>
      request.log.error(error, "verificacao de silencio da integracao falhou")
    );
    return pagina;
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
      // Limite por CHAVE de integracao (nao global): backfill/reprocesso e uso legitimo e mandaria
      // centenas de vendas em rajada. 300/min por chave cobre o agente (que ainda se auto-limita a
      // ~4 req/s) sem abrir a rota para keyless (cai no bucket do IP).
      config: {
        rateLimit: {
          max: 300,
          timeWindow: "1 minute",
          keyGenerator: (request) => chaveIntegracaoHeader(request.headers) ?? request.ip
        }
      }
    },
    async (request) => {
      const chave = chaveIntegracaoHeader(request.headers);
      if (!chave) throw naoAutorizado("Chave de integracao invalida", "INVALID_INTEGRATION_KEY");
      return ok(await receberVendaIntegracao(chave, request.body));
    }
  );

  // Conciliacao diaria sistema x CREARE, por PDV. Mesma chave (x-api-key) e mesmo rate limit da
  // ingestao — e o mesmo agente que chama, ao fim do ciclo. So le: o e-mail e o registro.
  app.post(
    "/api/integracoes/conciliacao",
    {
      // Mesmo criterio da ingestao: limite por chave (o agente chama uma vez por ciclo, mas um
      // backfill pode conciliar varios dias em sequencia).
      config: {
        rateLimit: {
          max: 300,
          timeWindow: "1 minute",
          keyGenerator: (request) => chaveIntegracaoHeader(request.headers) ?? request.ip
        }
      }
    },
    async (request) => {
      const chave = chaveIntegracaoHeader(request.headers);
      if (!chave) throw naoAutorizado("Chave de integracao invalida", "INVALID_INTEGRATION_KEY");
      return ok(await conciliarVendasDoDia(chave, request.body));
    }
  );
}
