import { fromNodeHeaders } from "better-auth/node";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ehTesouraria, temAlgumaPermissao, temPermissao, type PerfilUsuario, type Permissao } from "@padaria/shared";
import { erro } from "@padaria/shared/api";
import { auth } from "./config.js";
import { buscarPerfilUsuario } from "./perfil.service.js";

declare module "fastify" {
  interface FastifyRequest {
    perfilUsuario?: PerfilUsuario;
    usuarioId?: string;
  }
}

export async function exigirAutenticacao(request: FastifyRequest, reply: FastifyReply): Promise<PerfilUsuario | null> {
  // Ja resolvido nesta requisicao (pelo hook global default-deny ou por outro guard):
  // evita uma segunda ida ao banco por getSession/perfil.
  if (request.perfilUsuario && request.usuarioId) return request.perfilUsuario;

  const sessao = await auth.api.getSession({
    headers: fromNodeHeaders(request.headers)
  });

  if (!sessao) {
    erro(reply, 401, "Nao autenticado", "UNAUTHENTICATED");
    return null;
  }

  const perfil =
    request.usuarioId === sessao.user.id && request.perfilUsuario
      ? request.perfilUsuario
      : await buscarPerfilUsuario(sessao.user.id);
  if (!perfil) {
    erro(reply, 403, "Perfil de usuario nao configurado", "PROFILE_NOT_CONFIGURED");
    return null;
  }

  request.usuarioId = sessao.user.id;
  request.perfilUsuario = perfil;
  return perfil;
}

export function exigirPermissao(permissao: Permissao) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const perfil = await exigirAutenticacao(request, reply);
    if (!perfil) return;

    if (!temPermissao(perfil.permissoes, permissao)) {
      erro(reply, 403, "Permissao insuficiente", "INSUFFICIENT_PERMISSION", { permissao });
    }
  };
}

/** Regra de cargo além da permissão catalogada para atos exclusivos da Tesouraria. */
export function exigirTesouraria() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const perfil = await exigirAutenticacao(request, reply);
    if (!perfil) return;
    if (!ehTesouraria(perfil)) {
      erro(reply, 403, "Acesso exclusivo da Tesouraria", "TREASURY_ONLY");
    }
  };
}

export function exigirAlgumaPermissao(permissoes: Permissao[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const perfil = await exigirAutenticacao(request, reply);
    if (!perfil) return;

    if (!temAlgumaPermissao(perfil.permissoes, permissoes)) {
      const permissao = permissoes[0];
      erro(reply, 403, "Permissao insuficiente", "INSUFFICIENT_PERMISSION", permissao ? { permissao } : undefined);
    }
  };
}
