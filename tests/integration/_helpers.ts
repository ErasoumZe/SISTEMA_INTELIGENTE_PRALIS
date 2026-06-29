import type { FastifyInstance, InjectOptions } from "fastify";
import type { PerfilUsuario, Permissao, RoleUsuario } from "@padaria/shared";
import { expect } from "vitest";

export const empresaA = "11111111-1111-4111-8111-111111111111";
export const empresaB = "33333333-3333-4333-8333-333333333333";
export const usuarioId = "usuario-teste";
export const colaboradorId = "22222222-2222-4222-8222-222222222222";
export const cargoId = "44444444-4444-4444-8444-444444444444";
export const setorId = "55555555-5555-4555-8555-555555555555";
export const registroId = "66666666-6666-4666-8666-666666666666";

export function criarPerfil(
  permissoes: Permissao[] = [],
  sobrescrita: Partial<PerfilUsuario> = {}
): PerfilUsuario {
  return {
    usuarioId,
    nome: "Usuario Teste",
    email: "teste@padaria.local",
    empresaId: empresaA,
    empresaIds: [empresaA],
    colaboradorId,
    setorId,
    cargoIds: [cargoId],
    cargos: [{ id: cargoId, nome: "Cargo Teste" }],
    role: "usuario_comum" as RoleUsuario,
    permissoes,
    ...sobrescrita
  };
}

export async function requisitar(app: FastifyInstance, options: InjectOptions) {
  return app.inject({
    ...options,
    headers: {
      cookie: "sessao=teste",
      ...(options.headers ?? {})
    }
  });
}

export function expectProblem(body: unknown, status: number, title: string, details?: Record<string, unknown>) {
  expect(body).toMatchObject({
    type: "about:blank",
    title,
    status,
    ...(details ? { details } : {})
  });
}

export function expectOkData<T>(body: unknown, data: T) {
  expect(body).toEqual({ ok: true, data });
}

export function expectPaginatedData<T>(body: unknown, data: T[], total = data.length) {
  expect(body).toMatchObject({
    ok: true,
    data,
    meta: {
      pagination: {
        page: 1,
        pageSize: 10,
        total,
        totalPages: Math.max(1, Math.ceil(total / 10))
      }
    }
  });
}

export function expectNoContent(resposta: { statusCode: number; body: string }) {
  expect(resposta.statusCode).toBe(204);
  expect(resposta.body).toBe("");
}

export function payloadTema(empresaId = empresaA) {
  return {
    empresaId,
    tela: "entradas",
    corPrimaria: "#005f73",
    corSecundaria: "#0a9396",
    corFundo: "#f8fafc",
    corCartao: "#ffffff",
    corSucesso: "#16a34a",
    corAviso: "#d97706",
    corErro: "#dc2626"
  };
}

export function payloadVenda(empresaId = empresaA) {
  return {
    empresaId,
    dataReferencia: "2026-06-28",
    descricao: "Venda balcão",
    valorOriginal: 120,
    valorAcrescimo: 0,
    valorDesconto: 0,
    computar: true,
    itensVenda: [],
    tiposPagamento: []
  };
}

