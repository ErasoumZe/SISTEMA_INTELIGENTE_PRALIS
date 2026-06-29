import type { FastifyInstance } from "fastify";
import { exigirPermissao } from "../autorizacao.js";
import { podeAcessarEmpresa } from "../autorizacao/empresa.js";
import { permissaoCadastro } from "./cadastros.permissoes.js";
import { excluirPermissaoCadastro, listarPermissoesPaginadas, salvarCadastro } from "./cadastros.service.js";
import { empresasDoBody, tipoCadastroComIdParamsSchema, tipoCadastroParamsSchema } from "@padaria/shared/cadastros";
import { criadoId, erro, paginadoDeResultado, semConteudo } from "../respostas.js";

type CadastroSalvo = {
  id?: string;
  cargoId?: string;
  setorId?: string;
  usuarioId?: string;
};

function statusErroCadastro(mensagem: string) {
  if (mensagem === "Empresa nao permitida") return 403;
  if (mensagem === "Cadastro nao encontrado") return 404;
  return 400;
}

function idCadastroSalvo(resultado: CadastroSalvo, fallback: string) {
  return resultado.id ?? resultado.cargoId ?? resultado.setorId ?? resultado.usuarioId ?? fallback;
}

export async function registrarRotasCadastros(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/cadastros/permissoes",
    { preHandler: exigirPermissao("cadastro_permissoes") },
    async (request, reply) => {
      try {
        return paginadoDeResultado(await listarPermissoesPaginadas(request.query, request.perfilUsuario));
      } catch (error) {
        const mensagem = error instanceof Error ? error.message : "Cadastro invalido";
        return erro(reply, statusErroCadastro(mensagem), mensagem);
      }
    }
  );

  app.delete(
    "/api/cadastros/permissoes",
    { preHandler: exigirPermissao("cadastro_permissoes") },
    async (request, reply) => {
      try {
        await excluirPermissaoCadastro(request.query, request.perfilUsuario);
        return semConteudo(reply);
      } catch (error) {
        const mensagem = error instanceof Error ? error.message : "Cadastro invalido";
        return erro(reply, statusErroCadastro(mensagem), mensagem);
      }
    }
  );

  app.post(
    "/api/cadastros/:tipo",
    {
      preHandler: async (request, reply) => {
        const { tipo } = tipoCadastroParamsSchema.parse(request.params);
        const permissao = permissaoCadastro(tipo);
        if (!permissao) return erro(reply, 404, "Cadastro nao encontrado", "NOT_FOUND");
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
          return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
        }
        const salvo = (await salvarCadastro(tipo, null, request.body, request.usuarioId, request.perfilUsuario)) as CadastroSalvo;
        return criadoId(reply, idCadastroSalvo(salvo, tipo));
      } catch (error) {
        const mensagem = error instanceof Error ? error.message : "Cadastro invalido";
        return erro(reply, statusErroCadastro(mensagem), mensagem);
      }
    }
  );

  app.put(
    "/api/cadastros/:tipo/:id",
    {
      preHandler: async (request, reply) => {
        const { tipo } = tipoCadastroParamsSchema.parse(request.params);
        const permissao = permissaoCadastro(tipo);
        if (!permissao) return erro(reply, 404, "Cadastro nao encontrado", "NOT_FOUND");
        await exigirPermissao(permissao)(request, reply);
      }
    },
    async (request, reply) => {
      const { tipo, id } = tipoCadastroComIdParamsSchema.parse(request.params);
      try {
        if (tipo === "empresas" && request.perfilUsuario && !podeAcessarEmpresa(request.perfilUsuario, id)) {
          return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
        }
        const empresasBody = empresasDoBody(request.body);
        if (
          request.perfilUsuario &&
          empresasBody.some((empresaId) => !podeAcessarEmpresa(request.perfilUsuario!, empresaId))
        ) {
          return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
        }
        await salvarCadastro(tipo, id, request.body, request.usuarioId, request.perfilUsuario);
        return semConteudo(reply);
      } catch (error) {
        const mensagem = error instanceof Error ? error.message : "Cadastro invalido";
        return erro(reply, statusErroCadastro(mensagem), mensagem);
      }
    }
  );
}
