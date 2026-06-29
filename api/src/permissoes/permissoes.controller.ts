import type { FastifyInstance } from "fastify";
import { permissoesQuerySchema as empresaQuerySchema } from "@padaria/shared/permissoes";
import { criadoId, erro, ok, paginadoDeResultado, semConteudo } from "@padaria/shared/api";
import { exigirPermissao } from "../auth/guards.js";
import { escopoEmpresaAtiva, empresasPermitidas } from "../auth/empresa.js";
import { statusErroValidacao } from "../utils.js";
import { excluirPermissao, listarPermissoes, listarPermissoesPaginadas, salvarPermissao } from "./permissoes.service.js";

export async function registrarRotasPermissoes(app: FastifyInstance): Promise<void> {
  app.get("/api/permissoes", { preHandler: exigirPermissao("cadastro_permissoes_visualizar") }, async (request, reply) => {
    const query = empresaQuerySchema.parse(request.query);
    const empresasLiberadas = request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : [];
    try {
      const escopo = escopoEmpresaAtiva(empresasLiberadas, query.empresaId);
      return ok(await listarPermissoes(empresasLiberadas, escopo));
    } catch (error) {
      return erro(reply, 403, error instanceof Error ? error.message : "Empresa nao permitida", "FORBIDDEN_COMPANY");
    }
  });

  app.get("/api/permissoes/regras", { preHandler: exigirPermissao("cadastro_permissoes_visualizar") }, async (request, reply) => {
    try {
      return paginadoDeResultado(await listarPermissoesPaginadas(request.query, request.perfilUsuario));
    } catch (error) {
      const mensagem = error instanceof Error ? error.message : "Dados invalidos";
      return erro(reply, statusErroValidacao(mensagem), mensagem);
    }
  });

  app.delete("/api/permissoes/regras", { preHandler: exigirPermissao("cadastro_permissoes_excluir") }, async (request, reply) => {
    try {
      await excluirPermissao(request.query, request.perfilUsuario);
      return semConteudo(reply);
    } catch (error) {
      const mensagem = error instanceof Error ? error.message : "Dados invalidos";
      return erro(reply, statusErroValidacao(mensagem), mensagem);
    }
  });

  app.post("/api/permissoes", { preHandler: exigirPermissao("cadastro_permissoes_criar") }, async (request, reply) => {
    try {
      const salvo = await salvarPermissao(request.body, request.usuarioId, request.perfilUsuario);
      return criadoId(reply, salvo.cargoId ?? salvo.setorId ?? salvo.usuarioId ?? "permissoes");
    } catch (error) {
      const mensagem = error instanceof Error ? error.message : "Dados invalidos";
      return erro(reply, statusErroValidacao(mensagem), mensagem);
    }
  });

  app.put("/api/permissoes/:id", { preHandler: exigirPermissao("cadastro_permissoes_editar") }, async (request, reply) => {
    try {
      await salvarPermissao(request.body, request.usuarioId, request.perfilUsuario);
      return semConteudo(reply);
    } catch (error) {
      const mensagem = error instanceof Error ? error.message : "Dados invalidos";
      return erro(reply, statusErroValidacao(mensagem), mensagem);
    }
  });
}
