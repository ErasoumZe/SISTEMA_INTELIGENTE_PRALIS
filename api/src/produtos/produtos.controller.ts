import { mensagemDominioOuRelancar } from "../erros.js";
import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  exportarProdutoSchema as exportarPayloadSchema,
  importarProdutosSchema as importarPayloadSchema,
  produtoParamsSchema as idParamsSchema,
  produtosQuerySchema as empresaQuerySchema
} from "@padaria/shared/produtos";
import {
  criadoId,
  erro,
  ok,
  paginadoDeArray,
  semConteudo,
  type DadosExternos,
  type ReplyHttp
} from "@padaria/shared/api";
import { exigirAlgumaPermissao, exigirPermissao } from "../auth/guards.js";
import { escopoEmpresaAtiva, empresasPermitidas, podeAcessarEmpresa } from "../auth/empresa.js";
import { statusErroValidacao } from "../utils.js";
import {
  CodigoBarrasDuplicadoError,
  exportarProduto,
  importarProdutos,
  listarProdutos,
  ProdutoDuplicadoError,
  ProdutoNaoEncontradoError,
  ReferenciaDeOutraEmpresaError,
  salvarProduto
} from "./produtos.service.js";

/**
 * Rastro do ator sem tabela nova: `produtos.criado_por` guarda quem CRIOU (imutavel na edicao) e o
 * log estruturado da requisicao registra quem gravou, o que e em qual empresa. Coluna
 * `atualizado_por` exigiria migration, que nao esta autorizada nesta entrega.
 */
function registrarEscrita(
  request: FastifyRequest,
  acao: "criar" | "editar",
  dados: { produtoId: string; empresaId?: string }
) {
  request.log.info(
    { evento: "produto.escrita", acao, usuarioId: request.usuarioId, ...dados },
    "cadastro de produto gravado"
  );
}

function responderErroDeEscrita(reply: ReplyHttp, error: DadosExternos) {
  if (error instanceof CodigoBarrasDuplicadoError) return erro(reply, 409, error.message, "DUPLICATE_BARCODE");
  if (error instanceof ProdutoDuplicadoError) return erro(reply, 409, error.message, "DUPLICATE_PRODUCT");
  if (error instanceof ProdutoNaoEncontradoError) return erro(reply, 404, error.message, "NOT_FOUND");
  if (error instanceof ReferenciaDeOutraEmpresaError) return erro(reply, 403, error.message, "FORBIDDEN_COMPANY");
  const mensagem = mensagemDominioOuRelancar(error);
  return erro(reply, statusErroValidacao(mensagem), mensagem);
}

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
      const salvo = await salvarProduto(null, request.body, {
        usuarioId: request.usuarioId,
        empresasPermitidas: request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : []
      });
      registrarEscrita(request, "criar", { produtoId: salvo.id, empresaId: salvo.empresaId });
      return criadoId(reply, salvo?.id ?? "produtos");
    } catch (error) {
      return responderErroDeEscrita(reply, error);
    }
  });

  app.put("/api/produtos/:id", { preHandler: exigirPermissao("cadastro_produtos_editar") }, async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const body = request.body as { empresaId?: string };
    if (body.empresaId && request.perfilUsuario && !podeAcessarEmpresa(request.perfilUsuario, body.empresaId)) {
      return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
    }
    try {
      const salvo = await salvarProduto(id, request.body, {
        usuarioId: request.usuarioId,
        empresasPermitidas: request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : []
      });
      registrarEscrita(request, "editar", { produtoId: salvo.id, empresaId: salvo.empresaId });
      return semConteudo(reply);
    } catch (error) {
      return responderErroDeEscrita(reply, error);
    }
  });

  app.post(
    "/api/produtos/importar",
    { preHandler: exigirPermissao("cadastro_produtos_criar") },
    async (request, reply) => {
      try {
        return ok(await importarProdutos(importarPayloadSchema.parse(request.body), request.perfilUsuario));
      } catch (error) {
        if (error instanceof ProdutoNaoEncontradoError) return erro(reply, 404, error.message, "NOT_FOUND");
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
        if (error instanceof ProdutoNaoEncontradoError) return erro(reply, 404, error.message, "NOT_FOUND");
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, mensagem === "Empresa nao permitida" ? 403 : 400, mensagem);
      }
    }
  );
}
