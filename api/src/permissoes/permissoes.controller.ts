import { mensagemDominioOuRelancar } from "../erros.js";
import type { FastifyInstance } from "fastify";
import { permissoesQuerySchema as empresaQuerySchema } from "@padaria/shared/permissoes";
import { apiIdParamsSchema, criadoId, erro, ok, paginadoDeResultado, semConteudo } from "@padaria/shared/api";
import { z } from "zod";
import { exigirPermissao } from "../auth/guards.js";
import { escopoEmpresaAtiva, empresasPermitidas } from "../auth/empresa.js";
import { statusErroValidacao } from "../utils.js";
import {
  excluirPermissao,
  listarPermissoes,
  listarPermissoesPaginadas,
  resumirAcessoEfetivoUsuario,
  restaurarPadraoCargo,
  salvarPermissao
} from "./permissoes.service.js";

export async function registrarRotasPermissoes(app: FastifyInstance): Promise<void> {
  // IDs de usuario pertencem ao Better Auth e sao TEXT, nao UUID. Ainda assim, validamos o
  // parametro antes de consultar para impedir vazio ou entrada desproporcional.
  const usuarioIdParamsSchema = z.object({ id: z.string().trim().min(1).max(255) });
  app.get(
    "/api/permissoes",
    { preHandler: exigirPermissao("cadastro_permissoes_visualizar") },
    async (request, reply) => {
      const query = empresaQuerySchema.parse(request.query);
      const empresasLiberadas = request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : [];
      let escopo: string[];
      try {
        escopo = escopoEmpresaAtiva(empresasLiberadas, query.empresaId);
      } catch (error) {
        return erro(reply, 403, mensagemDominioOuRelancar(error), "FORBIDDEN_COMPANY");
      }

      // A consulta fica fora do catch de escopo: falhas tecnicas do banco precisam chegar ao handler
      // global como 500 logado, nunca virar uma falsa negacao de empresa com mensagem interna no corpo.
      return ok(await listarPermissoes(escopo));
    }
  );

  // Sem try/catch de proposito: listarPermissoesPaginadas sinaliza empresa fora do escopo com
  // ErroDominio, que o handler global ja traduz em 403 FORBIDDEN_COMPANY. Capturar aqui obrigaria a
  // classificar o erro por mensagem e faria falha tecnica do driver (o `pg` lanca Error puro sem
  // `code` quando a conexao cai) sair como negacao de empresa, sem log e sem Sentry.
  app.get(
    "/api/permissoes/regras",
    { preHandler: exigirPermissao("cadastro_permissoes_visualizar") },
    async (request) => paginadoDeResultado(await listarPermissoesPaginadas(request.query, request.perfilUsuario))
  );

  app.get(
    "/api/permissoes/usuarios/:id/efetivas",
    { preHandler: exigirPermissao("cadastro_permissoes_visualizar") },
    async (request) => {
      const { id } = usuarioIdParamsSchema.parse(request.params);
      return ok(await resumirAcessoEfetivoUsuario(id, request.perfilUsuario));
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
