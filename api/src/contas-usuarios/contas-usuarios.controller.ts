import type { FastifyInstance } from "fastify";
import {
  contaUsuarioParamsSchema,
  contaUsuarioPayloadSchema,
  contasUsuariosQuerySchema
} from "@padaria/shared/contas-usuarios";
import { criadoId, erro, ok, semConteudo } from "@padaria/shared/api";
import { escopoEmpresaAtiva, empresasPermitidas, podeAcessarEmpresa } from "../auth/empresa.js";
import { exigirPermissao } from "../auth/guards.js";
import { mensagemDominioOuRelancar } from "../erros.js";
import { statusErroValidacao } from "../utils.js";
import { criarContaUsuario, excluirContaUsuario, listarContasUsuarios } from "./contas-usuarios.service.js";

export async function registrarRotasContasUsuarios(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/contas-usuarios",
    { preHandler: exigirPermissao("cadastro_contas_usuarios_visualizar") },
    async (request, reply) => {
      const query = contasUsuariosQuerySchema.parse(request.query);
      try {
        const escopo = escopoEmpresaAtiva(
          request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : [],
          query.empresaId
        );
        return ok(
          await listarContasUsuarios({
            empresasPermitidas: escopo,
            ...(query.contaId ? { contaId: query.contaId } : {}),
            ...(query.usuarioId ? { usuarioId: query.usuarioId } : {})
          })
        );
      } catch (error) {
        return erro(reply, 403, mensagemDominioOuRelancar(error), "FORBIDDEN_COMPANY");
      }
    }
  );

  app.post(
    "/api/contas-usuarios",
    { preHandler: exigirPermissao("cadastro_contas_usuarios_criar") },
    async (request, reply) => {
      const body = contaUsuarioPayloadSchema.parse(request.body);
      if (request.perfilUsuario && !podeAcessarEmpresa(request.perfilUsuario, body.empresaId))
        return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
      try {
        const salvo = await criarContaUsuario(body);
        return criadoId(reply, salvo.id);
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErroValidacao(mensagem), mensagem);
      }
    }
  );

  app.delete(
    "/api/contas-usuarios/:id",
    { preHandler: exigirPermissao("cadastro_contas_usuarios_excluir") },
    async (request, reply) => {
      const { id } = contaUsuarioParamsSchema.parse(request.params);
      try {
        await excluirContaUsuario(id, request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : []);
        return semConteudo(reply);
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErroValidacao(mensagem), mensagem);
      }
    }
  );
}
