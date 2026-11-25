import { mensagemDominioOuRelancar } from "../erros.js";
import type { FastifyInstance } from "fastify";
import {
  exportarFornecedorSchema as exportarPayloadSchema,
  fornecedorParamsSchema as idParamsSchema,
  fornecedoresQuerySchema as empresaQuerySchema,
  importarFornecedoresSchema as importarPayloadSchema
} from "@padaria/shared/fornecedores";
import { criadoId, erro, ok, paginadoDeArray, semConteudo } from "@padaria/shared/api";
import { exigirAlgumaPermissao, exigirPermissao } from "../auth/guards.js";
import { escopoEmpresaAtiva, empresasPermitidas, podeAcessarEmpresa } from "../auth/empresa.js";
import { statusErroValidacao } from "../utils.js";
import {
  excluirFornecedor,
  exportarFornecedor,
  importarFornecedores,
  listarFornecedores,
  salvarFornecedor
} from "./fornecedores.service.js";

export async function registrarRotasFornecedores(app: FastifyInstance): Promise<void> {
  // Lista consumida como OPCAO de formulario (credor de despesa/mercadoria/retirada). Aceita quem
  // opera esses lancamentos, alem do cadastro de fornecedores.
  //
  // B-1: `retiradas_visualizar` entrou porque a R-128 fez do fornecedor o credor PADRAO da retirada
  // — o chip que ja vem ativo ao abrir. Um cargo com permissao so de retirada levava 403 aqui e o
  // caminho normal abria um select vazio. Quem entra apenas por permissao operacional recebe a
  // projecao reduzida, decidida em `listarFornecedores`.
  app.get(
    "/api/fornecedores",
    {
      preHandler: exigirAlgumaPermissao([
        "cadastro_fornecedores_visualizar",
        "despesas_visualizar",
        "mercadorias_visualizar",
        "retiradas_visualizar"
      ])
    },
    async (request, reply) => {
      const query = empresaQuerySchema.parse(request.query);
      try {
        const escopo = escopoEmpresaAtiva(
          request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : [],
          query.empresaId
        );
        return paginadoDeArray(await listarFornecedores(escopo, request.perfilUsuario), query.page, query.pageSize);
      } catch (error) {
        return erro(reply, 403, mensagemDominioOuRelancar(error), "FORBIDDEN_COMPANY");
      }
    }
  );

  app.post(
    "/api/fornecedores",
    { preHandler: exigirPermissao("cadastro_fornecedores_criar") },
    async (request, reply) => {
      const body = request.body as { empresaId?: string };
      if (body.empresaId && request.perfilUsuario && !podeAcessarEmpresa(request.perfilUsuario, body.empresaId)) {
        return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
      }
      try {
        const salvo = await salvarFornecedor(null, request.body);
        return criadoId(reply, salvo?.id ?? "fornecedores");
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErroValidacao(mensagem), mensagem);
      }
    }
  );

  app.put(
    "/api/fornecedores/:id",
    { preHandler: exigirPermissao("cadastro_fornecedores_editar") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as { empresaId?: string };
      if (body.empresaId && request.perfilUsuario && !podeAcessarEmpresa(request.perfilUsuario, body.empresaId)) {
        return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
      }
      try {
        await salvarFornecedor(id, request.body);
        return semConteudo(reply);
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErroValidacao(mensagem), mensagem);
      }
    }
  );

  // So fornecedor sem historico sai; com historico o service responde 409 FORNECEDOR_EM_USO (inativar).
  app.delete(
    "/api/fornecedores/:id",
    { preHandler: exigirPermissao("cadastro_fornecedores_excluir") },
    async (request, reply) => {
      const { id } = idParamsSchema.parse(request.params);
      const { empresaId } = empresaQuerySchema.parse(request.query);
      if (!empresaId) return erro(reply, 400, "empresaId obrigatorio");
      if (request.perfilUsuario && !podeAcessarEmpresa(request.perfilUsuario, empresaId)) {
        return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
      }
      await excluirFornecedor(id, empresaId);
      return semConteudo(reply);
    }
  );

  app.post(
    "/api/fornecedores/importar",
    { preHandler: exigirPermissao("cadastro_fornecedores_criar") },
    async (request, reply) => {
      try {
        return ok(await importarFornecedores(importarPayloadSchema.parse(request.body), request.perfilUsuario));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, mensagem === "Empresa nao permitida" ? 403 : 400, mensagem);
      }
    }
  );

  app.post(
    "/api/fornecedores/:id/exportar",
    { preHandler: exigirPermissao("cadastro_fornecedores_criar") },
    async (request, reply) => {
      const { id } = idParamsSchema.parse(request.params);
      try {
        return ok(await exportarFornecedor(id, exportarPayloadSchema.parse(request.body), request.perfilUsuario));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, mensagem === "Empresa nao permitida" ? 403 : 400, mensagem);
      }
    }
  );
}
