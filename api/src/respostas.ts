import type { FastifyReply } from "fastify";
import { criarPaginationMeta, paginarItens, type ApiSuccess, type JsonValue, type PaginationMeta, type ProblemDetails } from "@padaria/shared/api";

export function ok<T>(data: T): ApiSuccess<T> {
  return { ok: true, data };
}

export function paginado<T>(data: T[], pagination: PaginationMeta) {
  return { ok: true as const, data, meta: { pagination } };
}

export function paginadoDeArray<T>(itens: T[], page: number, pageSize: number) {
  const resultado = paginarItens(itens, page, pageSize);
  return paginado(resultado.itens, resultado.pagination);
}

export function paginadoDeResultado<T>(resultado: { itens: T[]; total: number; page: number; pageSize: number }) {
  return paginado(resultado.itens, criarPaginationMeta(resultado.total, resultado.page, resultado.pageSize));
}

export function criadoId(reply: FastifyReply, id: string) {
  return reply.status(201).send(ok({ id }));
}

export function semConteudo(reply: FastifyReply) {
  return reply.status(204).send();
}

export function erro(
  reply: FastifyReply,
  status: number,
  title: string,
  code?: string,
  details?: JsonValue
) {
  const body: ProblemDetails = {
    type: "about:blank",
    title,
    status,
    ...(code ? { code } : {}),
    ...(details === undefined ? {} : { details })
  };
  return reply.status(status).send(body);
}
