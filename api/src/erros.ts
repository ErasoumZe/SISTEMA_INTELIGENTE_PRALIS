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

/**
 * Um erro que pode vir EMBRULHADO: o que interessa e `code` e a corrente de `cause`.
 *
 * Tipo proprio (e nao `unknown`) porque o lint do projeto exige tipo explicito do dominio fora das
 * fronteiras de dados externos — e aqui a forma e conhecida: e o formato que o driver do Postgres e
 * o Drizzle produzem.
 */
export type ErroEncadeado = {
  code?: string;
  cause?: ErroEncadeado;
};

/**
 * O SQLSTATE do Postgres, procurado ao longo de TODA a cadeia de `cause`.
 *
 * A R-164 contratou que contencao transitoria vira **503 LOCK_OCUPADO**, nunca 500 opaco: o
 * operador precisa saber que e so tentar de novo, e o agente CREARE re-tenta 5xx mas DESCARTA 4xx
 * (R-013 proibe descartar venda). O contrato estava furado porque `app.ts` lia `error.code` so na
 * RAIZ, e o Drizzle entrega o erro do pg EMBRULHADO — a raiz vem sem `code` e o SQLSTATE fica em
 * `cause`. Medido na rota real, com duas transferencias opostas simultaneas:
 *
 *     Error(code=undefined) -> cause: error(code=40P01)  "deadlock detected"   => HTTP 500
 *
 * Por que o filtro de formato: `code` tambem e usado pelo Node para erros proprios
 * (`ECONNREFUSED`, `ERR_MODULE_NOT_FOUND`). SQLSTATE e sempre 5 caracteres alfanumericos, entao o
 * formato separa um do outro sem lista de excecoes — e a busca CONTINUA descendo quando acha um
 * `code` que nao e SQLSTATE, senao um erro do Node por cima esconderia o do banco embaixo.
 */
export function codigoPostgresDoErro(erro: ErroEncadeado | null | undefined): string | undefined {
  const vistos = new Set<ErroEncadeado>();
  let atual = erro;
  // Teto de profundidade alem do `vistos`: cadeia circular nao pode virar laco infinito.
  for (let nivel = 0; nivel < 10 && atual && typeof atual === "object"; nivel += 1) {
    if (vistos.has(atual)) break;
    vistos.add(atual);
    const codigo = atual.code;
    if (typeof codigo === "string" && /^[0-9A-Z]{5}$/.test(codigo)) return codigo;
    atual = atual.cause;
  }
  return undefined;
}
