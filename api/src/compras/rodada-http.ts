import type { FastifyRequest } from "fastify";

/**
 * Fase 2 — porta HTTP do fornecedor na rodada, num lugar so (mesmo desenho da cotacao). O token vai
 * no CABECALHO, nunca em caminho ou query: `req.url` vai para log, historico do navegador e `Referer`.
 *
 * O nome precisa casar com o `allowedHeaders` do CORS e com a redacao de log em `app.ts`.
 */
export const CABECALHO_DA_RODADA = "x-rodada-token";

export function tokenDaRodada(request: FastifyRequest): string | undefined {
  const valor = request.headers[CABECALHO_DA_RODADA];
  if (typeof valor !== "string") return undefined;
  const limpo = valor.trim();
  return limpo === "" ? undefined : limpo;
}

/** Teto por LINK, com queda para IP: o link e de um fornecedor, nao de uma rede atras de NAT. */
export const TETO_RODADA = {
  config: {
    rateLimit: {
      max: 60,
      timeWindow: "1 minute",
      keyGenerator: (request: FastifyRequest) => tokenDaRodada(request) ?? request.ip
    }
  }
};
