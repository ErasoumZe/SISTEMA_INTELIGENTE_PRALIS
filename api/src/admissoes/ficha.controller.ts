import type { FastifyInstance, FastifyReply } from "fastify";
import { processoParamsSchema } from "@padaria/shared/admissoes";
import type { DadosExternos } from "@padaria/shared/api";
import { erro, ok, semConteudo } from "@padaria/shared/api";
import { exigirPermissao } from "../auth/guards.js";
import { mensagemDominioOuRelancar } from "../erros.js";
import { statusErroValidacao } from "../utils.js";
import { TETO_PUBLICO, tokenDoCabecalho } from "./convite-http.js";
import {
  aprovarFicha,
  devolverFicha,
  enviarFicha,
  obterFichaParaRevisao,
  obterFichaPublica,
  salvarRascunhoFicha
} from "./ficha.service.js";

/**
 * ADM-003 V3 — as rotas da ficha.
 *
 * Duas famílias, e a separacao e proposital:
 *
 * - `/api/admissao/*` e PUBLICA. Autentica pelo header `x-admissao-convite`, tem teto proprio de
 *   requisicoes e precisa de entrada literal na allowlist do default-deny em `app.ts`.
 * - `/api/admissoes/processos/:id/ficha*` e do DP, com sessao e permissao.
 *
 * O token NUNCA aparece em caminho nem em query. So no header — porque `req.url` vai para o log do
 * servidor, para o historico do navegador e para o `Referer`, e o proprio repositorio ja registrou
 * esse defeito no link de recuperacao de senha.
 *
 * O nome do cabecalho, a leitura dele e o teto de requisicoes moram em `convite-http.ts`: as
 * rotas de dependente da V4 usam exatamente os mesmos, e uma copia divergente nao quebraria
 * teste nenhum — so pararia de autenticar.
 */

function responderErro(reply: FastifyReply, error: DadosExternos) {
  const mensagem = mensagemDominioOuRelancar(error);
  return erro(reply, statusErroValidacao(mensagem), mensagem);
}

export async function registrarRotasAdmissaoFicha(app: FastifyInstance): Promise<void> {
  // --- Publicas (token) --------------------------------------------------------------------------
  app.get("/api/admissao/ficha", TETO_PUBLICO, async (request) => {
    return ok(await obterFichaPublica(tokenDoCabecalho(request) ?? undefined));
  });

  app.put("/api/admissao/ficha", TETO_PUBLICO, async (request, reply) => {
    await salvarRascunhoFicha(tokenDoCabecalho(request) ?? undefined, request.body ?? {});
    return semConteudo(reply);
  });

  app.post("/api/admissao/ficha/enviar", TETO_PUBLICO, async (request, reply) => {
    await enviarFicha(tokenDoCabecalho(request) ?? undefined, request.body ?? {});
    return semConteudo(reply);
  });

  // --- Do DP (sessao) ----------------------------------------------------------------------------
  app.get(
    "/api/admissoes/processos/:id/ficha",
    { preHandler: exigirPermissao("admissoes_processos_ver_ficha") },
    async (request, reply) => {
      try {
        const { id } = processoParamsSchema.parse(request.params);
        return ok(await obterFichaParaRevisao(id, request.perfilUsuario));
      } catch (error) {
        return responderErro(reply, error);
      }
    }
  );

  app.post(
    "/api/admissoes/processos/:id/ficha/devolver",
    { preHandler: exigirPermissao("admissoes_processos_revisar_ficha") },
    async (request, reply) => {
      try {
        const { id } = processoParamsSchema.parse(request.params);
        await devolverFicha(id, request.body ?? {}, request.perfilUsuario);
        return semConteudo(reply);
      } catch (error) {
        return responderErro(reply, error);
      }
    }
  );

  app.post(
    "/api/admissoes/processos/:id/ficha/aprovar",
    { preHandler: exigirPermissao("admissoes_processos_revisar_ficha") },
    async (request, reply) => {
      try {
        const { id } = processoParamsSchema.parse(request.params);
        await aprovarFicha(id, request.body ?? {}, request.perfilUsuario);
        return semConteudo(reply);
      } catch (error) {
        return responderErro(reply, error);
      }
    }
  );
}
