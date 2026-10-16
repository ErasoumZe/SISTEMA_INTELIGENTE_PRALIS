import type { FastifyInstance } from "fastify";
import { apiIdParamsSchema } from "@padaria/shared/api";
import { ok, semConteudo } from "@padaria/shared/api";
import { exigirPermissao } from "../auth/guards.js";
import { TETO_COTACAO, tokenDaCotacao } from "./cotacao-http.js";
import { enviarCotacao, gerarCotacao, obterCotacaoPublica, salvarRascunhoCotacao } from "./cotacoes.service.js";

/**
 * R-216 — rotas da cotacao de fornecedor. Duas familias, como na ficha de admissao:
 *
 * - `/api/pedidos/:id/cotacoes` e do Comprador, com sessao e permissao de editar pedido;
 * - `/api/cotacao*` e PUBLICA: autentica pelo cabecalho `x-cotacao-token`, tem teto proprio e
 *   precisa de entrada literal na allowlist do default-deny em `app.ts`.
 */
export async function registrarRotasCotacoes(app: FastifyInstance): Promise<void> {
  app.post("/api/pedidos/:id/cotacoes", { preHandler: exigirPermissao("pedidos_editar") }, async (request, reply) => {
    const { id } = apiIdParamsSchema.parse(request.params);
    return reply.status(201).send(ok(await gerarCotacao(id, request.perfilUsuario!)));
  });

  // --- Publicas (token) --------------------------------------------------------------------------
  // `no-store`: a resposta tem precos e chega por aparelho de terceiro; nenhum cache intermediario
  // nem o historico do navegador deve guardar.
  app.get("/api/cotacao", TETO_COTACAO, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    return ok(await obterCotacaoPublica(tokenDaCotacao(request)));
  });

  app.put("/api/cotacao", TETO_COTACAO, async (request, reply) => {
    await salvarRascunhoCotacao(tokenDaCotacao(request), request.body ?? {});
    return semConteudo(reply);
  });

  app.post("/api/cotacao/enviar", TETO_COTACAO, async (request, reply) => {
    await enviarCotacao(tokenDaCotacao(request), request.body ?? {});
    return semConteudo(reply);
  });
}
