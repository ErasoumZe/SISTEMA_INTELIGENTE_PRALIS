import type { FastifyInstance } from "fastify";
import { exigirPermissao } from "../autorizacao.js";
import { podeAcessarEmpresa } from "../autorizacao/empresa.js";
import { permissaoCadastro } from "./cadastros.permissoes.js";
import { salvarCadastro } from "./cadastros.service.js";
import { empresasDoBody, tipoCadastroComIdParamsSchema, tipoCadastroParamsSchema } from "@padaria/shared/cadastros";

export async function registrarRotasCadastros(app: FastifyInstance): Promise<void> {
  app.post(
    "/api/cadastros/:tipo",
    {
      preHandler: async (request, reply) => {
        const { tipo } = tipoCadastroParamsSchema.parse(request.params);
        const permissao = permissaoCadastro(tipo);
        if (!permissao) return reply.status(404).send({ erro: "Cadastro nao encontrado" });
        await exigirPermissao(permissao)(request, reply);
      }
    },
    async (request, reply) => {
      const { tipo } = tipoCadastroParamsSchema.parse(request.params);
      try {
        const empresasBody = empresasDoBody(request.body);
        if (
          request.perfilUsuario &&
          empresasBody.some((empresaId) => !podeAcessarEmpresa(request.perfilUsuario!, empresaId))
        ) {
          return reply.status(403).send({ erro: "Empresa nao permitida" });
        }
        return await salvarCadastro(tipo, null, request.body, request.usuarioId, request.perfilUsuario);
      } catch (error) {
        const mensagem = error instanceof Error ? error.message : "Cadastro invalido";
        return reply.status(mensagem === "Empresa nao permitida" ? 403 : 400).send({ erro: mensagem });
      }
    }
  );

  app.put(
    "/api/cadastros/:tipo/:id",
    {
      preHandler: async (request, reply) => {
        const { tipo } = tipoCadastroParamsSchema.parse(request.params);
        const permissao = permissaoCadastro(tipo);
        if (!permissao) return reply.status(404).send({ erro: "Cadastro nao encontrado" });
        await exigirPermissao(permissao)(request, reply);
      }
    },
    async (request, reply) => {
      const { tipo, id } = tipoCadastroComIdParamsSchema.parse(request.params);
      try {
        if (tipo === "empresas" && request.perfilUsuario && !podeAcessarEmpresa(request.perfilUsuario, id)) {
          return reply.status(403).send({ erro: "Empresa nao permitida" });
        }
        const empresasBody = empresasDoBody(request.body);
        if (
          request.perfilUsuario &&
          empresasBody.some((empresaId) => !podeAcessarEmpresa(request.perfilUsuario!, empresaId))
        ) {
          return reply.status(403).send({ erro: "Empresa nao permitida" });
        }
        return await salvarCadastro(tipo, id, request.body, request.usuarioId, request.perfilUsuario);
      } catch (error) {
        const mensagem = error instanceof Error ? error.message : "Cadastro invalido";
        return reply.status(mensagem === "Empresa nao permitida" ? 403 : 400).send({ erro: mensagem });
      }
    }
  );
}
