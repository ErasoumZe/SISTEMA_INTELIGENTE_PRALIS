import type { FastifyInstance } from "fastify";
import { patrimonioQuerySchema, patrimonioParamsSchema } from "@padaria/shared/patrimonio";
import { criadoId, erro, ok, semConteudo } from "@padaria/shared/api";
import { mensagemDominioOuRelancar } from "../erros.js";
import { exigirPermissao } from "../auth/guards.js";
import { escopoEmpresaAtiva, empresasPermitidas, podeAcessarEmpresa } from "../auth/empresa.js";
import { statusErroValidacao } from "../utils.js";
import {
  excluirGrupoPatrimonio,
  excluirPatrimonioItem,
  listarPatrimonio,
  salvarGrupoPatrimonio,
  salvarPatrimonioItem
} from "./patrimonio.service.js";

export async function registrarRotasPatrimonio(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/patrimonio",
    { preHandler: exigirPermissao("cadastro_patrimonio_visualizar") },
    async (request, reply) => {
      const query = patrimonioQuerySchema.parse(request.query);
      try {
        const escopo = escopoEmpresaAtiva(
          request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : [],
          query.empresaId
        );
        return ok(await listarPatrimonio(escopo));
      } catch (error) {
        return erro(reply, 403, mensagemDominioOuRelancar(error), "FORBIDDEN_COMPANY");
      }
    }
  );

  function negarEmpresaAlheia(request: { perfilUsuario?: { empresaIds?: string[] } }, body: { empresaId?: string }) {
    return Boolean(
      body.empresaId && request.perfilUsuario && !podeAcessarEmpresa(request.perfilUsuario, body.empresaId)
    );
  }

  app.post(
    "/api/patrimonio-grupos",
    { preHandler: exigirPermissao("cadastro_patrimonio_criar") },
    async (request, reply) => {
      const body = request.body as { empresaId?: string };
      if (negarEmpresaAlheia(request, body)) return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
      try {
        const salvo = await salvarGrupoPatrimonio(null, request.body);
        return criadoId(reply, salvo?.id ?? "patrimonio-grupos");
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErroValidacao(mensagem), mensagem);
      }
    }
  );

  app.put(
    "/api/patrimonio-grupos/:id",
    { preHandler: exigirPermissao("cadastro_patrimonio_editar") },
    async (request, reply) => {
      const { id } = patrimonioParamsSchema.parse(request.params);
      const body = request.body as { empresaId?: string };
      if (negarEmpresaAlheia(request, body)) return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
      try {
        await salvarGrupoPatrimonio(id, request.body);
        return semConteudo(reply);
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErroValidacao(mensagem), mensagem);
      }
    }
  );

  app.delete(
    "/api/patrimonio-grupos/:id",
    { preHandler: exigirPermissao("cadastro_patrimonio_excluir") },
    async (request, reply) => {
      const { id } = patrimonioParamsSchema.parse(request.params);
      await excluirGrupoPatrimonio(id, request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : null);
      return semConteudo(reply);
    }
  );

  app.post(
    "/api/patrimonio-itens",
    { preHandler: exigirPermissao("cadastro_patrimonio_criar") },
    async (request, reply) => {
      const body = request.body as { empresaId?: string };
      if (negarEmpresaAlheia(request, body)) return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
      try {
        const salvo = await salvarPatrimonioItem(null, request.body);
        return criadoId(reply, salvo?.id ?? "patrimonio-itens");
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErroValidacao(mensagem), mensagem);
      }
    }
  );

  app.put(
    "/api/patrimonio-itens/:id",
    { preHandler: exigirPermissao("cadastro_patrimonio_editar") },
    async (request, reply) => {
      const { id } = patrimonioParamsSchema.parse(request.params);
      const body = request.body as { empresaId?: string };
      if (negarEmpresaAlheia(request, body)) return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
      try {
        await salvarPatrimonioItem(id, request.body);
        return semConteudo(reply);
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErroValidacao(mensagem), mensagem);
      }
    }
  );

  app.delete(
    "/api/patrimonio-itens/:id",
    { preHandler: exigirPermissao("cadastro_patrimonio_excluir") },
    async (request, reply) => {
      const { id } = patrimonioParamsSchema.parse(request.params);
      await excluirPatrimonioItem(id, request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : null);
      return semConteudo(reply);
    }
  );
}
