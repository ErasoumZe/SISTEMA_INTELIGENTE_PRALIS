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

/**
 * 410 — existiu e acabou. Distinto do 404 de proposito: para quem tem o link, "expirou" e uma
 * informacao util; para quem esta adivinhando, o 404 nao confirma que o recurso existe.
 *
 * O caixa ja fazia isso com `new ErroDominio(msg, 410, code)` na mao (token de autorizacao).
 */
export function foiEmbora(message: string, code = "GONE", details?: JsonValue): ErroDominio {
  return new ErroDominio(message, 410, code, details);
}

export function conflito(message: string, code = "CONFLICT", details?: JsonValue): ErroDominio {
  return new ErroDominio(message, 409, code, details);
}
