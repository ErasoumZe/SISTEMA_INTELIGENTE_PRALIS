import { fromNodeHeaders } from "better-auth/node";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { PerfilUsuario, Permissao } from "@padaria/shared";
import { auth } from "./auth.js";
import { buscarPerfilUsuario } from "./perfis.js";

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
    reply.status(401).send({ erro: "Nao autenticado" });
    return null;
  }

  const perfil = await buscarPerfilUsuario(sessao.user.id);
  if (!perfil) {
    reply.status(403).send({ erro: "Perfil de usuario nao configurado" });
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
      reply.status(403).send({ erro: "Permissao insuficiente", permissao });
    }
  };
}
