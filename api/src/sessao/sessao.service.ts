import { fromNodeHeaders } from "better-auth/node";
import type { FastifyRequest } from "fastify";
import { auth } from "../auth.js";
import { buscarPerfilUsuario } from "../perfis.js";

export async function carregarSessaoComPerfil(request: FastifyRequest) {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(request.headers)
  });

  if (!session) return null;

  const perfil = await buscarPerfilUsuario(session.user.id);
  return { ...session, perfil };
}
