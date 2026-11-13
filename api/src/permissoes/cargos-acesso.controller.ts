import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { criadoId, ok } from "@padaria/shared/api";
import { exigirPermissao } from "../auth/guards.js";
import {
  criarCargoPadrao,
  resumirCargosAcesso,
  seguirSoOCargo,
  trocarCargoContaPosto
} from "./cargos-acesso.service.js";

const empresaQuerySchema = z.object({ empresaId: z.string().uuid() });
// IDs de usuario sao do Better Auth (TEXT, nao UUID).
const usuarioParamsSchema = z.object({ usuarioId: z.string().trim().min(1).max(255) });

// Aba "Cargos" de Permissoes (Marco, 13/11/2026). O "restaurar padrao" do cargo continua na rota que ja
// existia (POST /api/permissoes/cargo/:id/restaurar-padrao); aqui entram a lista, a criacao do cargo de
// referencia que falta e a troca do cargo das contas de posto do Caixa.
export async function registrarRotasCargosAcesso(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/permissoes/cargos-acesso",
    { preHandler: exigirPermissao("cadastro_permissoes_visualizar") },
    async (request) => {
      const { empresaId } = empresaQuerySchema.parse(request.query);
      return ok(await resumirCargosAcesso(empresaId, request.perfilUsuario));
    }
  );

  app.post(
    "/api/permissoes/cargos-acesso/padrao",
    { preHandler: exigirPermissao("cadastro_permissoes_editar") },
    async (request, reply) => {
      const criado = await criarCargoPadrao(request.body, request.perfilUsuario);
      return criadoId(reply, criado.id, { nome: criado.nome });
    }
  );

  app.put(
    "/api/permissoes/contas-posto/:usuarioId/cargo",
    { preHandler: exigirPermissao("cadastro_permissoes_editar") },
    async (request) => {
      const { usuarioId } = usuarioParamsSchema.parse(request.params);
      return ok(await trocarCargoContaPosto(usuarioId, request.body, request.perfilUsuario));
    }
  );

  app.post(
    "/api/permissoes/contas-posto/:usuarioId/seguir-cargo",
    { preHandler: exigirPermissao("cadastro_permissoes_editar") },
    async (request) => {
      const { usuarioId } = usuarioParamsSchema.parse(request.params);
      return ok(await seguirSoOCargo(usuarioId, request.body, request.perfilUsuario));
    }
  );
}
