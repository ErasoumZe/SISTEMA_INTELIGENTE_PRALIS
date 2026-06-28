import type { FastifyInstance, InjectOptions } from "fastify";
import type { PerfilUsuario, Permissao, RoleUsuario } from "@padaria/shared";

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

export function payloadMovimentacao(empresaId = empresaA) {
  return {
    empresaId,
    tipo: "entrada",
    dataReferencia: "2026-06-28",
    dataVencimento: "2026-06-28",
    descricao: "Venda balcão",
    valorOriginal: 120,
    valorAcrescimo: 0,
    valorDesconto: 0,
    computar: true,
    itensDespesa: [],
    itensMercadoria: []
  };
}
