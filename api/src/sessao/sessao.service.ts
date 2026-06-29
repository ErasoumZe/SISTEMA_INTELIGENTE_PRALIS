import { fromNodeHeaders } from "better-auth/node";
import type { FastifyRequest } from "fastify";
import { auth } from "../auth.js";
import { listarEmpresas } from "../catalogos/catalogos.service.js";
import { buscarPerfilUsuario } from "../perfis.js";
import { normalizarConfiguracaoAparencia } from "../tema/tema.repository.js";

export async function carregarSessaoComPerfil(request: FastifyRequest) {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(request.headers)
  });

  if (!session) return null;

  const perfil = await buscarPerfilUsuario(session.user.id);
  const empresas = perfil
    ? (await listarEmpresas(perfil)).map((empresa) => ({
        ...empresa,
        configuracoesAparencia: normalizarConfiguracaoAparencia(
          (empresa as { configuracoesAparencia?: unknown }).configuracoesAparencia
        )
      }))
    : [];

  return { ...session, perfil, empresas };
}
