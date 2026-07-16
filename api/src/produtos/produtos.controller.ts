import { mensagemDominioOuRelancar } from "../erros.js";
import type { FastifyInstance } from "fastify";
import {
  exportarProdutoSchema as exportarPayloadSchema,
  importarProdutosSchema as importarPayloadSchema,
  produtoParamsSchema as idParamsSchema,
  produtosQuerySchema as empresaQuerySchema
} from "@padaria/shared/produtos";
import { criadoId, erro, ok, paginadoDeArray, semConteudo } from "@padaria/shared/api";
import { exigirAlgumaPermissao, exigirPermissao } from "../auth/guards.js";
import { escopoEmpresaAtiva, empresasPermitidas, podeAcessarEmpresa } from "../auth/empresa.js";
import { statusErroValidacao } from "../utils.js";
import {
  exportarProduto,
  importarProdutos,
  listarProdutos,
  ProdutoDuplicadoError,
  salvarProduto
} from "./produtos.service.js";

export async function registrarRotasProdutos(app: FastifyInstance): Promise<void> {
  // Lista consumida como OPCAO de formulario (itens de mercadoria). Aceita quem opera mercadorias,
  // alem do cadastro de produtos.
  app.get(
    "/api/produtos",
    { preHandler: exigirAlgumaPermissao(["cadastro_produtos_visualizar", "mercadorias_visualizar"]) },
    async (request, reply) => {
      const query = empresaQuerySchema.parse(request.query);
      try {
        const escopo = escopoEmpresaAtiva(
          request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : [],
          query.empresaId
        );
        return paginadoDeArray(await listarProdutos(escopo), query.page, query.pageSize);
      } catch (error) {
        return erro(reply, 403, mensagemDominioOuRelancar(error), "FORBIDDEN_COMPANY");
      }
    }
  );

  app.post("/api/produtos", { preHandler: exigirPermissao("cadastro_produtos_criar") }, async (request, reply) => {
    const body = request.body as { empresaId?: string };
    if (body.empresaId && request.perfilUsuario && !podeAcessarEmpresa(request.perfilUsuario, body.empresaId)) {
      return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
    }
    try {
      const salvo = await salvarProduto(null, request.body, request.usuarioId);
      return criadoId(reply, salvo?.id ?? "produtos");
    } catch (error) {
      if (error instanceof ProdutoDuplicadoError) return erro(reply, 409, error.message, "DUPLICATE_PRODUCT");
      const mensagem = mensagemDominioOuRelancar(error);
      return erro(reply, statusErroValidacao(mensagem), mensagem);
    }
  });

  app.put("/api/produtos/:id", { preHandler: exigirPermissao("cadastro_produtos_editar") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { empresaId?: string };
    if (body.empresaId && request.perfilUsuario && !podeAcessarEmpresa(request.perfilUsuario, body.empresaId)) {
      return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
    }
    try {
      await salvarProduto(id, request.body, request.usuarioId);
      return semConteudo(reply);
    } catch (error) {
      if (error instanceof ProdutoDuplicadoError) return erro(reply, 409, error.message, "DUPLICATE_PRODUCT");
      const mensagem = mensagemDominioOuRelancar(error);
      return erro(reply, statusErroValidacao(mensagem), mensagem);
    }
  });

  app.post(
    "/api/produtos/importar",
    { preHandler: exigirPermissao("cadastro_produtos_criar") },
    async (request, reply) => {
      try {
        return ok(await importarProdutos(importarPayloadSchema.parse(request.body), request.perfilUsuario));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, mensagem === "Empresa nao permitida" ? 403 : 400, mensagem);
      }
    }
  );

  app.post(
    "/api/produtos/:id/exportar",
    { preHandler: exigirPermissao("cadastro_produtos_criar") },
    async (request, reply) => {
      const { id } = idParamsSchema.parse(request.params);
      try {
        return ok(await exportarProduto(id, exportarPayloadSchema.parse(request.body), request.perfilUsuario));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, mensagem === "Empresa nao permitida" ? 403 : 400, mensagem);
      }
    }
  );
}
