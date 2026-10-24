import type { FastifyInstance } from "fastify";
import { erro, ok } from "@padaria/shared/api";
import { exigirAutenticacao } from "../auth/guards.js";
import { GoogleConfiguracaoAusenteError } from "./google-auth.js";
import { GoogleConnectionError, testarConexaoGoogle } from "./google-connection.service.js";

export async function registrarRotasGoogle(app: FastifyInstance): Promise<void> {
  app.get("/api/integracoes/google/conexao", async (request, reply) => {
    const perfil = await exigirAutenticacao(request, reply);
    if (!perfil) return;
    if (perfil.role !== "usuario_admin") {
      return erro(reply, 403, "Acesso administrativo necessario", "ADMIN_PERMISSION_REQUIRED");
    }

    try {
      return ok(await testarConexaoGoogle());
    } catch (error) {
      if (error instanceof GoogleConfiguracaoAusenteError) {
        return erro(reply, 503, error.message, error.code);
      }
      if (error instanceof GoogleConnectionError) {
        return erro(reply, error.status, error.message, error.code, error.details);
      }
      throw error;
    }
  });
}
