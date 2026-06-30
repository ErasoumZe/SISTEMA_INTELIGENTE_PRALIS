import type { JsonValue } from "@padaria/shared/api";

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

export function conflito(message: string, code = "CONFLICT", details?: JsonValue): ErroDominio {
  return new ErroDominio(message, 409, code, details);
}
