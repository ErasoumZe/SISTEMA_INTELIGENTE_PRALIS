import { mensagemDominioOuRelancar } from "../erros.js";
import type { FastifyInstance } from "fastify";
import { permissoesQuerySchema as empresaQuerySchema } from "@padaria/shared/permissoes";
import { apiIdParamsSchema, criadoId, erro, ok, paginadoDeResultado, semConteudo } from "@padaria/shared/api";
import { exigirPermissao } from "../auth/guards.js";
import { escopoEmpresaAtiva, empresasPermitidas } from "../auth/empresa.js";
import { statusErroValidacao } from "../utils.js";
import {
  excluirPermissao,
  listarPermissoes,
  listarPermissoesPaginadas,
  restaurarPadraoCargo,
  salvarPermissao
} from "./permissoes.service.js";

export async function registrarRotasPermissoes(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/permissoes",
    { preHandler: exigirPermissao("cadastro_permissoes_visualizar") },
    async (request, reply) => {
      const query = empresaQuerySchema.parse(request.query);
      const empresasLiberadas = request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : [];
      try {
        const escopo = escopoEmpresaAtiva(empresasLiberadas, query.empresaId);
        return ok(await listarPermissoes(empresasLiberadas, escopo));
      } catch (error) {
        return erro(reply, 403, mensagemDominioOuRelancar(error), "FORBIDDEN_COMPANY");
      }
    }
  );

  app.get(
    "/api/permissoes/regras",
    { preHandler: exigirPermissao("cadastro_permissoes_visualizar") },
    async (request, reply) => {
      try {
        return paginadoDeResultado(await listarPermissoesPaginadas(request.query, request.perfilUsuario));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErroValidacao(mensagem), mensagem);
      }
    }
  );

  app.delete(
    "/api/permissoes/regras",
    { preHandler: exigirPermissao("cadastro_permissoes_excluir") },
    async (request, reply) => {
      try {
        await excluirPermissao(request.query, request.perfilUsuario);
        return semConteudo(reply);
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErroValidacao(mensagem), mensagem);
      }
    }
  );

  app.post("/api/permissoes", { preHandler: exigirPermissao("cadastro_permissoes_criar") }, async (request, reply) => {
    try {
      const salvo = await salvarPermissao(request.body, request.usuarioId, request.perfilUsuario);
      return criadoId(reply, salvo.cargoId ?? salvo.setorId ?? salvo.usuarioId ?? "permissoes");
    } catch (error) {
      const mensagem = mensagemDominioOuRelancar(error);
      return erro(reply, statusErroValidacao(mensagem), mensagem);
    }
  });

  app.put(
    "/api/permissoes/:id",
    { preHandler: exigirPermissao("cadastro_permissoes_editar") },
    async (request, reply) => {
      try {
        await salvarPermissao(request.body, request.usuarioId, request.perfilUsuario);
        return semConteudo(reply);
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErroValidacao(mensagem), mensagem);
      }
    }
  );

  // Restaura as permissoes de um cargo para o padrao da referencia (REPLACE) — recupera regras que a
  // UI tenha desligado e que o merge do bootstrap nunca restaura.
  app.post(
    "/api/permissoes/cargo/:id/restaurar-padrao",
    { preHandler: exigirPermissao("cadastro_permissoes_editar") },
    async (request, reply) => {
      try {
        const { id } = apiIdParamsSchema.parse(request.params);
        return ok(await restaurarPadraoCargo(id, request.perfilUsuario));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErroValidacao(mensagem), mensagem);
      }
    }
  );
}
