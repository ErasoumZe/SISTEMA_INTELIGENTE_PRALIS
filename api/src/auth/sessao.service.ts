import { fromNodeHeaders } from "better-auth/node";
import type { FastifyRequest } from "fastify";
import { listarEmpresas } from "../empresas/empresas.service.js";
import { normalizarConfiguracaoAparencia } from "../tema/tema.repository.js";
import { auth } from "./config.js";
import { buscarPerfilUsuario } from "./perfil.service.js";

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
