import type { DadosExternos, JsonValue } from "@padaria/shared/api";

// Uso nos catch dos controllers. Services legados sinalizam regra de negocio com
// `new Error("mensagem")` — para esses, retorna a mensagem para o mapeamento local de status.
// Qualquer outra coisa e relancada para o error handler global: ErroDominio responde com
// status/codigo proprios; falhas tecnicas (driver pg, Zod, TypeError...) viram 500 logado,
// nunca 400 com mensagem interna crua.
export function mensagemDominioOuRelancar(error: DadosExternos): string {
  if (error instanceof Error && !(error instanceof ErroDominio) && error.constructor === Error && !("code" in error)) {
    return error.message;
  }
  throw error;
}

/**
 * O SQLSTATE do Postgres, procurado na CADEIA de causas — nunca so no topo.
 *
 * O Drizzle embrulha TODA falha de query num `DrizzleQueryError`
 * (`node_modules/drizzle-orm/errors.js`), cuja mensagem e `Failed query: <SQL>\nparams: <params>` e
 * que **nao copia o `code`**: o erro do driver `pg`, com `code`/`constraint`/`detail`, fica em
 * `cause`. Ler `(error as { code }).code` direto devolve `undefined` para todo erro de banco, e
 * ramos como "55P03 vira 503" viram codigo morto sem ninguem perceber.
 *
 * `api/src/caixa/caixa.service.ts` ja fazia essa varredura a mao para o `23505` da abertura de
 * caixa; isto e a mesma leitura, num lugar so. Percorre a cadeia inteira porque nada garante que o
 * embrulho tenha um nivel unico.
 */
export function codigoPostgresDoErro(error: Error | null): string | undefined {
  let atual: Error | null = error;
  for (let nivel = 0; nivel < 5 && atual; nivel += 1) {
    const codigo = (atual as Error & { code?: string }).code;
    if (typeof codigo === "string") return codigo;
    atual = atual.cause instanceof Error ? atual.cause : null;
  }
  return undefined;
}

// Falha que NAO e regra de negocio. Existe para NAO cair no ramo de `mensagemDominioOuRelancar` que
// devolve `error.message` ao cliente: por ser subclasse (`constructor !== Error`), e relancada e o
// handler global a loga e responde 500 "Erro interno", sem detalhe interno no corpo.
export class ErroTecnico extends Error {}

export function falhaTecnica(message: string): ErroTecnico {
  return new ErroTecnico(message);
}

export class ErroDominio extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: JsonValue
  ) {
    super(message);
  }
}

export function erroValidacao(message: string, code = "VALIDATION_ERROR", details?: JsonValue): ErroDominio {
  return new ErroDominio(message, 400, code, details);
}

export function naoAutorizado(message: string, code = "UNAUTHORIZED", details?: JsonValue): ErroDominio {
  return new ErroDominio(message, 401, code, details);
}

export function proibido(message: string, code = "FORBIDDEN", details?: JsonValue): ErroDominio {
  return new ErroDominio(message, 403, code, details);
}

export function naoEncontrado(message: string, code = "NOT_FOUND", details?: JsonValue): ErroDominio {
  return new ErroDominio(message, 404, code, details);
}

export function naoProcessavel(message: string, code = "UNPROCESSABLE_ENTITY", details?: JsonValue): ErroDominio {
  return new ErroDominio(message, 422, code, details);
}

export function conflito(message: string, code = "CONFLICT", details?: JsonValue): ErroDominio {
  return new ErroDominio(message, 409, code, details);
}
