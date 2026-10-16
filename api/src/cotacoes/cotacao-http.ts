import type { FastifyRequest } from "fastify";

/**
 * R-216 — a porta HTTP do fornecedor, num lugar so. Mesmo desenho da ficha de admissao
 * (`admissoes/convite-http.ts`): o token vai no CABECALHO, nunca em caminho ou query, porque
 * `req.url` vai para log, historico do navegador e `Referer`.
 *
 * O nome do cabecalho precisa casar com o `allowedHeaders` do CORS e com a redacao de log em
 * `app.ts`. Se mudar aqui, mude la — um nome divergente nao quebra teste, so para de autenticar.
 */
export const CABECALHO_DA_COTACAO = "x-cotacao-token";

export function tokenDaCotacao(request: FastifyRequest): string | undefined {
  const valor = request.headers[CABECALHO_DA_COTACAO];
  if (typeof valor !== "string") return undefined;
  const limpo = valor.trim();
  return limpo === "" ? undefined : limpo;
}

/** Teto por LINK, com queda para IP: o link e de um fornecedor, nao de uma rede inteira atras de NAT. */
export const TETO_COTACAO = {
  config: {
    rateLimit: {
      max: 60,
      timeWindow: "1 minute",
      keyGenerator: (request: FastifyRequest) => tokenDaCotacao(request) ?? request.ip
    }
  }
};
