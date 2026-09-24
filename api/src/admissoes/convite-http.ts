import type { FastifyRequest } from "fastify";

/**
 * ADM-003 — a porta HTTP do candidato, num lugar so.
 *
 * O nome do cabecalho, a leitura dele e o teto de requisicoes vivem aqui porque duas familias de
 * rotas publicas os usam (ficha e dependentes) e porque cada copia seria uma chance de divergir:
 * um controller com outro nome de header nao quebra teste nenhum, so para de autenticar.
 *
 * O token NUNCA aparece em caminho nem em query. So no cabecalho — porque `req.url` vai para o log
 * do servidor, para o historico do navegador e para o `Referer`.
 */
export const CABECALHO_DO_CONVITE = "x-admissao-convite";

export function tokenDoCabecalho(request: FastifyRequest): string | null {
  const valor = request.headers[CABECALHO_DO_CONVITE];
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  return limpo === "" ? null : limpo;
}

/**
 * Teto por LINK, com queda para IP: um link e de uma pessoa, nao de uma populacao — e NAT de
 * operadora faria candidatos diferentes se punirem.
 *
 * Ressalva honesta: o `@fastify/rate-limit` conta por ROTA. Compartilhar este objeto compartilha a
 * POLITICA, nao o balde — cada rota publica tem os seus 60/min por token. O teto real por token e a
 * soma delas, limitado pelo teto global de 300/min de `app.ts`.
 */
export const TETO_PUBLICO = {
  config: {
    rateLimit: {
      max: 60,
      timeWindow: "1 minute",
      keyGenerator: (request: FastifyRequest) => tokenDoCabecalho(request) ?? request.ip
    }
  }
};
