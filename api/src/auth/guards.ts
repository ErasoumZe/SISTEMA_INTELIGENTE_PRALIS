import { fromNodeHeaders } from "better-auth/node";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { PerfilUsuario, Permissao } from "@padaria/shared";
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
  const sessao = await auth.api.getSession({
    headers: fromNodeHeaders(request.headers)
  });

  if (!sessao) {
    erro(reply, 401, "Nao autenticado", "UNAUTHENTICATED");
    return null;
  }

  const perfil = await buscarPerfilUsuario(sessao.user.id);
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

    if (!perfil.permissoes.includes(permissao)) {
      erro(reply, 403, "Permissao insuficiente", "INSUFFICIENT_PERMISSION", { permissao });
    }
  };
}

export function exigirAlgumaPermissao(permissoes: Permissao[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const perfil = await exigirAutenticacao(request, reply);
    if (!perfil) return;

    if (!permissoes.some((permissao) => perfil.permissoes.includes(permissao))) {
      const permissao = permissoes[0];
      erro(reply, 403, "Permissao insuficiente", "INSUFFICIENT_PERMISSION", permissao ? { permissao } : undefined);
    }
  };
}

