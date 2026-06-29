import { z } from "zod";

export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface PaginationMeta {
  page: number;
  pageSize: number;
  pageSizeOptions: number[];
  total: number;
  totalPages: number;
}

export type ProblemDetails = {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  code?: string;
  requestId?: string;
  details?: JsonValue;
};

export type ApiSuccess<T> = {
  ok: true;
  data: T;
  message?: string;
};

export type ApiPaginated<T> = {
  ok: true;
  data: T[];
  meta: {
    pagination: PaginationMeta;
  };
  message?: string;
};

export type ApiId = ApiSuccess<{ id: string }>;
export type ApiNoContent = void;
export type ApiError = ProblemDetails;
export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export type ReplyHttp = {
  status(statusCode: number): {
    send(payload?: unknown): unknown;
  };
  send(payload?: unknown): unknown;
};

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10)
});

const uuidSchema = z.string().uuid();

export const empresaQuerySchema = z
  .object({
    empresaId: uuidSchema.optional()
  })
  .merge(paginationQuerySchema);

export const apiIdParamsSchema = z.object({
  id: uuidSchema
});

export const importarEmpresaPayloadSchema = z.object({
  empresaOrigemId: uuidSchema,
  empresaDestinoId: uuidSchema,
  modo: z.enum(["simples", "completo"]).default("simples")
});

export const exportarEmpresaPayloadSchema = z.object({
  empresaDestinoId: uuidSchema,
  modo: z.enum(["simples", "completo"]).default("simples")
});

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValueSchema), z.record(z.string(), jsonValueSchema)])
);

export const problemDetailsSchema = z
  .object({
    type: z.string(),
    title: z.string(),
    status: z.number(),
    detail: z.string().optional(),
    instance: z.string().optional(),
    code: z.string().optional(),
    requestId: z.string().optional(),
    details: jsonValueSchema.optional()
  })
  .catchall(jsonValueSchema);

export const paginationMetaSchema = z.object({
  page: z.number(),
  pageSize: z.number(),
  pageSizeOptions: z.array(z.number()),
  total: z.number(),
  totalPages: z.number()
});

export function apiSuccessSchema<T extends z.ZodType>(data: T) {
  return z.object({
    ok: z.literal(true),
    data,
    message: z.string().optional()
  });
}

export function apiPaginatedSchema<T extends z.ZodType>(item: T) {
  return z.object({
    ok: z.literal(true),
    data: z.array(item),
    meta: z.object({ pagination: paginationMetaSchema }),
    message: z.string().optional()
  });
}

export const apiIdSchema = apiSuccessSchema(z.object({ id: z.string() }));

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
export type EmpresaQuery = z.infer<typeof empresaQuerySchema>;
export type ApiIdParams = z.infer<typeof apiIdParamsSchema>;
export type ImportarEmpresaPayload = z.infer<typeof importarEmpresaPayloadSchema>;
export type ExportarEmpresaPayload = z.infer<typeof exportarEmpresaPayloadSchema>;
export type ModoImportacaoEmpresa = ImportarEmpresaPayload["modo"];

export function criarPaginationMeta(total: number, page: number, pageSize: number): PaginationMeta {
  return {
    page,
    pageSize,
    pageSizeOptions: [...PAGE_SIZE_OPTIONS],
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize))
  };
}

export function paginarItens<T>(itens: T[], page: number, pageSize: number) {
  const inicio = (page - 1) * pageSize;
  return {
    itens: itens.slice(inicio, inicio + pageSize),
    pagination: criarPaginationMeta(itens.length, page, pageSize)
  };
}

export function ok<T>(data: T): ApiSuccess<T> {
  return { ok: true, data };
}

export function paginado<T>(data: T[], pagination: PaginationMeta): ApiPaginated<T> {
  return { ok: true, data, meta: { pagination } };
}

export function paginadoDeArray<T>(itens: T[], page: number, pageSize: number) {
  const resultado = paginarItens(itens, page, pageSize);
  return paginado(resultado.itens, resultado.pagination);
}

export function paginadoDeResultado<T>(resultado: { itens: T[]; total: number; page: number; pageSize: number }) {
  return paginado(resultado.itens, criarPaginationMeta(resultado.total, resultado.page, resultado.pageSize));
}

export function criadoId(reply: ReplyHttp, id: string) {
  return reply.status(201).send(ok({ id }));
}

export function semConteudo(reply: ReplyHttp) {
  return reply.status(204).send();
}

export function erro(reply: ReplyHttp, status: number, title: string, code?: string, details?: JsonValue) {
  const body: ProblemDetails = {
    type: "about:blank",
    title,
    status,
    ...(code ? { code } : {}),
    ...(details === undefined ? {} : { details })
  };
  return reply.status(status).send(body);
}
