import { createReadStream } from "node:fs";
import { mensagemDominioOuRelancar } from "../erros.js";
import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  exportarProdutoSchema as exportarPayloadSchema,
  importarProdutosSchema as importarPayloadSchema,
  produtoParamsSchema as idParamsSchema,
  produtosListaQuerySchema,
  produtosOpcoesQuerySchema,
  produtosQuerySchema as empresaQuerySchema
} from "@padaria/shared/produtos";
import {
  criadoId,
  erro,
  ok,
  paginadoDeResultado,
  semConteudo,
  type DadosExternos,
  type ReplyHttp
} from "@padaria/shared/api";
import { exigirAlgumaPermissao, exigirAutenticacao, exigirPermissao } from "../auth/guards.js";
import { escopoEmpresaAtiva, empresasPermitidas, podeAcessarEmpresa } from "../auth/empresa.js";
import { statusErroValidacao } from "../utils.js";
import { montarCsvCatalogo } from "./produtos-csv.js";
import { montarXlsxCatalogo } from "./produtos-xlsx.js";
import { FotoInvalidaError, TAMANHO_MAXIMO_DA_FOTO } from "./produtos-foto.js";
import {
  CodigoBarrasDuplicadoError,
  buscarBackupCatalogoProdutos,
  consultarPanoramaFiscalProdutos,
  detalharProduto,
  exportarCatalogoCsvProdutos,
  exportarProduto,
  importarProdutos,
  listarFiltrosDeProduto,
  listarHistoricoNomesProduto,
  listarOpcoesDeProduto,
  listarProdutos,
  obterFotoDeProdutoNoEscopo,
  ProdutoDuplicadoError,
  ProdutoNaoEncontradoError,
  ReferenciaDeOutraEmpresaError,
  removerFotoDeProdutoNoEscopo,
  salvarFotoDeProdutoNoEscopo,
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

/**
 * Foto: 404 para produto inexistente/alheio (indistinguiveis) e 400 para arquivo recusado. O
 * upload NUNCA responde 2xx quando so a foto falhou — o front precisa poder repetir sem duplicar
 * o produto.
 */
function responderErroDeFoto(reply: ReplyHttp, error: DadosExternos) {
  if (error instanceof ProdutoNaoEncontradoError) return erro(reply, 404, error.message, "NOT_FOUND");
  if (error instanceof FotoInvalidaError) return erro(reply, 400, error.message, "INVALID_PHOTO");
  const mensagem = mensagemDominioOuRelancar(error);
  return erro(reply, statusErroValidacao(mensagem), mensagem);
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
  app.get(
    "/api/produtos/fiscal/panorama",
    { preHandler: exigirPermissao("cadastro_produtos_visualizar") },
    async (request, reply) => {
      if (request.perfilUsuario?.role !== "usuario_admin") {
        return erro(
          reply,
          403,
          "Somente administradores podem consultar o panorama fiscal.",
          "INSUFFICIENT_PERMISSION"
        );
      }
      return ok(await consultarPanoramaFiscalProdutos(request.perfilUsuario));
    }
  );

  app.get(
    "/api/produtos/export.csv",
    { preHandler: exigirPermissao("cadastro_produtos_visualizar") },
    async (request, reply) => {
      if (request.perfilUsuario?.role !== "usuario_admin") {
        return erro(reply, 403, "Somente administradores podem exportar o catálogo.", "INSUFFICIENT_PERMISSION");
      }
      const linhas = await exportarCatalogoCsvProdutos(request.perfilUsuario);
      reply.header("Content-Type", "text/csv; charset=utf-8");
      reply.header("Content-Disposition", 'attachment; filename="produtos-pralis.csv"');
      reply.header("Cache-Control", "no-store");
      return reply.send(montarCsvCatalogo(linhas));
    }
  );

  app.get(
    "/api/produtos/backup.xlsx",
    { preHandler: exigirPermissao("cadastro_produtos_visualizar") },
    async (request, reply) => {
      if (request.perfilUsuario?.role !== "usuario_admin") {
        return erro(
          reply,
          403,
          "Somente administradores podem exportar o backup do catálogo.",
          "INSUFFICIENT_PERMISSION"
        );
      }
      const dados = await buscarBackupCatalogoProdutos(request.perfilUsuario);
      reply.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      reply.header("Content-Disposition", 'attachment; filename="backup-produtos-pralis.xlsx"');
      reply.header("Cache-Control", "no-store");
      return reply.send(montarXlsxCatalogo(dados));
    }
  );

  /**
   * Listagem COMPLETA da tela de Produtos: busca, quatro filtros, seis ordenacoes e paginacao —
   * tudo no banco. Exige `cadastro_produtos_visualizar`; quem so opera mercadorias usa `/opcoes`.
   */
  app.get("/api/produtos", { preHandler: exigirPermissao("cadastro_produtos_visualizar") }, async (request, reply) => {
    const query = produtosListaQuerySchema.parse(request.query);
    try {
      const escopoEmpresas = escopoEmpresaAtiva(
        request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : [],
        query.empresaId
      );
      const { itens, total } = await listarProdutos({
        escopoEmpresas,
        busca: query.busca,
        status: query.status,
        tipo: query.tipo,
        grupoMercadoriaId: query.grupoMercadoriaId,
        setorEstoque: query.setorEstoque,
        somenteVendidos: query.somenteVendidos,
        ordenar: query.ordenar,
        page: query.page,
        pageSize: query.pageSize
      });
      return paginadoDeResultado({ itens, total, page: query.page, pageSize: query.pageSize });
    } catch (error) {
      return erro(reply, 403, mensagemDominioOuRelancar(error), "FORBIDDEN_COMPANY");
    }
  });

  /**
   * ROTAS ESTATICAS ANTES DE `/:id` — senao o Fastify casaria "opcoes" e "filtros" como um id.
   *
   * `/opcoes` e a projecao REDUZIDA para escolher produto em formulario: sem fiscal, custo, margem
   * ou preco. Por isso aceita tambem quem so opera mercadorias.
   */
  app.get(
    "/api/produtos/opcoes",
    { preHandler: exigirAlgumaPermissao(["cadastro_produtos_visualizar", "mercadorias_visualizar"]) },
    async (request, reply) => {
      const query = produtosOpcoesQuerySchema.parse(request.query);
      try {
        const escopoEmpresas = escopoEmpresaAtiva(
          request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : [],
          query.empresaId
        );
        return ok(await listarOpcoesDeProduto({ escopoEmpresas, busca: query.busca, ids: query.ids }));
      } catch (error) {
        return erro(reply, 403, mensagemDominioOuRelancar(error), "FORBIDDEN_COMPANY");
      }
    }
  );

  /** Valores existentes de setor e grupo, para montar o painel de filtros da listagem. */
  app.get(
    "/api/produtos/filtros",
    { preHandler: exigirPermissao("cadastro_produtos_visualizar") },
    async (request, reply) => {
      const query = empresaQuerySchema.parse(request.query);
      try {
        const escopo = escopoEmpresaAtiva(
          request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : [],
          query.empresaId
        );
        return ok(await listarFiltrosDeProduto(escopo));
      } catch (error) {
        return erro(reply, 403, mensagemDominioOuRelancar(error), "FORBIDDEN_COMPANY");
      }
    }
  );

  /** Detalhe completo (com as quatro satelites) para o formulario de edicao. */
  app.get(
    "/api/produtos/:id",
    { preHandler: exigirPermissao("cadastro_produtos_visualizar") },
    async (request, reply) => {
      const { id } = idParamsSchema.parse(request.params);
      try {
        const escopo = request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : [];
        return ok(await detalharProduto(id, escopo));
      } catch (error) {
        if (error instanceof ProdutoNaoEncontradoError) return erro(reply, 404, error.message, "NOT_FOUND");
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErroValidacao(mensagem), mensagem);
      }
    }
  );

  app.get(
    "/api/produtos/:id/historico-nomes",
    {
      preHandler: async (request, reply) => {
        const perfil = await exigirAutenticacao(request, reply);
        if (!perfil) return;
        if (perfil.role !== "usuario_admin") {
          erro(reply, 403, "Somente administradores podem consultar o histórico de nomes", "INSUFFICIENT_PERMISSION");
        }
      }
    },
    async (request, reply) => {
      const { id } = idParamsSchema.parse(request.params);
      const query = empresaQuerySchema.parse(request.query);
      try {
        const escopo = request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : [];
        const empresaId = query.empresaId ?? request.perfilUsuario?.empresaId;
        if (!empresaId) return erro(reply, 400, "Informe a empresa do produto", "INVALID_COMPANY");
        return ok(await listarHistoricoNomesProduto(empresaId, id, escopo));
      } catch (error) {
        if (error instanceof ProdutoNaoEncontradoError) return erro(reply, 404, error.message, "NOT_FOUND");
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErroValidacao(mensagem), mensagem);
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
        nome: request.perfilUsuario?.nome,
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
        nome: request.perfilUsuario?.nome,
        empresasPermitidas: request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : []
      });
      registrarEscrita(request, "editar", { produtoId: salvo.id, empresaId: salvo.empresaId });
      return semConteudo(reply);
    } catch (error) {
      return responderErroDeEscrita(reply, error);
    }
  });

  /**
   * FOTO do produto: multipart -> `/app/storage` (sem Cloudinary). Quem pode criar OU editar
   * produto pode enviar; quem pode visualizar pode ver.
   */
  app.post(
    "/api/produtos/:id/foto",
    { preHandler: exigirAlgumaPermissao(["cadastro_produtos_criar", "cadastro_produtos_editar"]) },
    async (request, reply) => {
      const { id } = idParamsSchema.parse(request.params);
      try {
        const arquivo = await request.file({ limits: { fileSize: TAMANHO_MAXIMO_DA_FOTO, files: 1 } });
        const escopo = request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : [];
        return reply.status(201).send(ok(await salvarFotoDeProdutoNoEscopo(id, arquivo, escopo)));
      } catch (error) {
        return responderErroDeFoto(reply, error);
      }
    }
  );

  app.delete(
    "/api/produtos/:id/foto",
    { preHandler: exigirPermissao("cadastro_produtos_editar") },
    async (request, reply) => {
      const { id } = idParamsSchema.parse(request.params);
      try {
        const escopo = request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : [];
        await removerFotoDeProdutoNoEscopo(id, escopo);
        return semConteudo(reply);
      } catch (error) {
        return responderErroDeFoto(reply, error);
      }
    }
  );

  app.get(
    "/api/produtos/:id/foto",
    { preHandler: exigirPermissao("cadastro_produtos_visualizar") },
    async (request, reply) => {
      const { id } = idParamsSchema.parse(request.params);
      try {
        const escopo = request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : [];
        const foto = await obterFotoDeProdutoNoEscopo(id, escopo);
        // Foto legada continua sendo URL externa: redireciona em vez de fingir que veio do storage.
        if (foto.tipo === "externa") return reply.redirect(foto.url, 302);
        reply.header("Content-Type", foto.mimeType);
        reply.header("Cache-Control", "private, max-age=300");
        return reply.send(createReadStream(foto.caminhoAbsoluto));
      } catch (error) {
        return responderErroDeFoto(reply, error);
      }
    }
  );

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
