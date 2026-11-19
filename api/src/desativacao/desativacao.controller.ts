import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { apiIdParamsSchema, ok } from "@padaria/shared/api";
import { exigirPermissao } from "../auth/guards.js";
import { desativarConta, desativarPdv, desativarUsuario, reativarConta } from "./desativacao.service.js";

// IDs de usuario sao do Better Auth (TEXT, nao UUID).
const usuarioParamsSchema = z.object({ id: z.string().trim().min(1).max(255) });

// "Excluir" usuario, conta ou PDV (Marco, 13/11/2026) = desativar. A permissao de editar o cadastro abre a rota;
// o servico ainda exige o administrador total.
export async function registrarRotasDesativacao(app: FastifyInstance): Promise<void> {
  app.post("/api/pdvs/:id/desativar", { preHandler: exigirPermissao("cadastro_pdv_editar") }, async (request) => {
    const { id } = apiIdParamsSchema.parse(request.params);
    return ok(await desativarPdv(id, request.perfilUsuario));
  });

  app.post("/api/contas/:id/desativar", { preHandler: exigirPermissao("cadastro_contas_editar") }, async (request) => {
    const { id } = apiIdParamsSchema.parse(request.params);
    return ok(await desativarConta(id, request.perfilUsuario));
  });

  // R-245: a conta inativa volta pelo mesmo cadastro (Ativar), tambem so pelo administrador.
  app.post("/api/contas/:id/reativar", { preHandler: exigirPermissao("cadastro_contas_editar") }, async (request) => {
    const { id } = apiIdParamsSchema.parse(request.params);
    return ok(await reativarConta(id, request.perfilUsuario));
  });

  app.post(
    "/api/usuarios/:id/desativar",
    { preHandler: exigirPermissao("cadastro_usuarios_editar") },
    async (request) => {
      const { id } = usuarioParamsSchema.parse(request.params);
      return ok(await desativarUsuario(id, request.perfilUsuario));
    }
  );
}
