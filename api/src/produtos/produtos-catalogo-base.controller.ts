import type { FastifyInstance, FastifyRequest } from "fastify";
import { criadoId, erro, ok, type DadosExternos, type ReplyHttp } from "@padaria/shared/api";
import { produtoParamsSchema, produtosQuerySchema } from "@padaria/shared/produtos";
import { createReadStream } from "node:fs";
import { FotoInvalidaError, TAMANHO_MAXIMO_DA_FOTO } from "./produtos-foto.js";
import { z } from "zod";
import { exigirPermissao } from "../auth/guards.js";
import { empresasPermitidas } from "../auth/empresa.js";
import { CodigoBarrasDuplicadoError, ProdutoDuplicadoError, ProdutoNaoEncontradoError } from "./produtos.service.js";
import { copiarProdutoBaseParaLoja, listarCatalogoBase } from "./produtos-catalogo-base.service.js";
import { publicarCreareDaEmpresaAposSalvar } from "./produtos-creare-drive.js";
import {
  BaseSemCorrespondenciaError,
  criarProdutoBase,
  detalharProdutoBase,
  editarProdutoBase,
  obterFotoDaBase,
  removerFotoDaBase,
  salvarFotoDaBase,
  SoAdministradorNaBaseError
} from "./produtos-base.service.js";
import { responderErroDeEscrita } from "./produtos.controller.js";

function atorDaRequisicao(request: FastifyRequest) {
  const perfil = request.perfilUsuario;
  return {
    usuarioId: request.usuarioId,
    nome: perfil?.nome,
    empresasPermitidas: perfil ? empresasPermitidas(perfil) : [],
    administrador: perfil?.role === "usuario_admin"
  };
}

function responderErroDaBase(reply: ReplyHttp, error: DadosExternos) {
  if (error instanceof SoAdministradorNaBaseError) return erro(reply, 403, error.message, error.code);
  if (error instanceof BaseSemCorrespondenciaError) return erro(reply, 422, error.message, error.code);
  if (error instanceof FotoInvalidaError) return erro(reply, 400, error.message, "INVALID_PHOTO");
  if (error instanceof ProdutoNaoEncontradoError) return erro(reply, 404, error.message, "NOT_FOUND");
  return responderErroDeEscrita(reply, error);
}

const queryCatalogoBase = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
  busca: z.string().trim().max(200).optional(),
  status: z.enum(["ativo", "inativo"]).optional()
});
const produtoBaseParams = z.object({ produtoBaseId: z.string().uuid() });
const corpoCopiaBase = z.object({ empresaId: z.string().uuid().optional() });
const corpoCopiaLote = z.object({
  empresaId: z.string().uuid().optional(),
  produtoBaseIds: z.array(z.string().uuid()).min(1).max(100)
});

export async function registrarRotasCatalogoBase(app: FastifyInstance): Promise<void> {
  /**
   * Modelo BASE (oficial): produto NOVO so o administrador cria, sempre na base geral; as lojas
   * recebem por importacao. Unidade e grupo sao escolhidos no cadastro da empresa de referencia
   * (`empresaId` do corpo) e a BASE guarda sigla e nome.
   */
  app.post("/api/produtos/base", { preHandler: exigirPermissao("cadastro_produtos_criar") }, async (request, reply) => {
    try {
      const criado = await criarProdutoBase(request.body, atorDaRequisicao(request));
      request.log.info({
        evento: "produto_base.escrita",
        acao: "criar",
        usuarioId: request.usuarioId,
        produtoBaseId: criado.id
      });
      return criadoId(reply, criado.id);
    } catch (error) {
      return responderErroDaBase(reply, error);
    }
  });

  /** O produto da BASE no formato do formulario, resolvido para a empresa de referencia. */
  app.get(
    "/api/produtos/base/:id",
    { preHandler: exigirPermissao("cadastro_produtos_visualizar") },
    async (request, reply) => {
      const { id } = produtoParamsSchema.parse(request.params);
      const query = produtosQuerySchema.parse(request.query);
      const ator = atorDaRequisicao(request);
      const empresaId = query.empresaId ?? request.perfilUsuario?.empresaId;
      if (!empresaId) return erro(reply, 400, "Informe a empresa de referencia", "INVALID_COMPANY");
      try {
        return ok(await detalharProdutoBase(id, empresaId, ator.empresasPermitidas));
      } catch (error) {
        return responderErroDaBase(reply, error);
      }
    }
  );

  /** Foto da BASE (oficial: campo herdado). Trocar desce para as lojas que seguem a foto. */
  app.post(
    "/api/produtos/base/:id/foto",
    { preHandler: exigirPermissao("cadastro_produtos_editar") },
    async (request, reply) => {
      const { id } = produtoParamsSchema.parse(request.params);
      try {
        const arquivo = await request.file({ limits: { fileSize: TAMANHO_MAXIMO_DA_FOTO, files: 1 } });
        return reply.status(201).send(ok(await salvarFotoDaBase(id, arquivo, atorDaRequisicao(request))));
      } catch (error) {
        return responderErroDaBase(reply, error);
      }
    }
  );

  app.delete(
    "/api/produtos/base/:id/foto",
    { preHandler: exigirPermissao("cadastro_produtos_editar") },
    async (request, reply) => {
      const { id } = produtoParamsSchema.parse(request.params);
      try {
        await removerFotoDaBase(id, atorDaRequisicao(request));
        return reply.status(204).send();
      } catch (error) {
        return responderErroDaBase(reply, error);
      }
    }
  );

  app.get(
    "/api/produtos/base/:id/foto",
    { preHandler: exigirPermissao("cadastro_produtos_visualizar") },
    async (request, reply) => {
      const { id } = produtoParamsSchema.parse(request.params);
      try {
        const foto = await obterFotoDaBase(id);
        reply.header("Content-Type", foto.mimeType);
        reply.header("Cache-Control", "private, max-age=300");
        return reply.send(createReadStream(foto.caminhoAbsoluto));
      } catch (error) {
        return responderErroDaBase(reply, error);
      }
    }
  );

  /** Editar a BASE (so administrador): a mudanca desce para as lojas que ainda seguem cada campo. */
  app.put(
    "/api/produtos/base/:id",
    { preHandler: exigirPermissao("cadastro_produtos_editar") },
    async (request, reply) => {
      const { id } = produtoParamsSchema.parse(request.params);
      try {
        const salvo = await editarProdutoBase(id, request.body, atorDaRequisicao(request));
        request.log.info({
          evento: "produto_base.escrita",
          acao: "editar",
          usuarioId: request.usuarioId,
          produtoBaseId: id
        });
        return ok(salvo);
      } catch (error) {
        return responderErroDaBase(reply, error);
      }
    }
  );

  app.get(
    "/api/produtos/catalogo-base",
    { preHandler: exigirPermissao("cadastro_produtos_visualizar") },
    async (request) => {
      const query = queryCatalogoBase.parse(request.query);
      const resultado = await listarCatalogoBase(query);
      return ok({ ...resultado, page: query.page, pageSize: query.pageSize });
    }
  );

  app.post(
    "/api/produtos/catalogo-base/importar",
    { preHandler: exigirPermissao("cadastro_produtos_criar") },
    async (request, reply) => {
      const corpo = corpoCopiaLote.parse(request.body);
      const perfil = request.perfilUsuario;
      const empresaId = corpo.empresaId ?? perfil?.empresaId;
      const permitidas = perfil ? empresasPermitidas(perfil) : [];
      if (!empresaId || !permitidas.includes(empresaId)) {
        return erro(reply, 403, "Empresa de destino não permitida.", "FORBIDDEN_COMPANY");
      }

      const itens: Array<{ produtoBaseId: string; estado: string; motivo?: string }> = [];
      for (const produtoBaseId of [...new Set(corpo.produtoBaseIds)]) {
        try {
          const resultado = await copiarProdutoBaseParaLoja({
            produtoBaseId,
            empresaId,
            ator: { usuarioId: request.usuarioId, nome: perfil?.nome, empresasPermitidas: permitidas },
            publicarNoDrive: false
          });
          itens.push({
            produtoBaseId,
            estado: resultado.estado,
            ...("motivo" in resultado ? { motivo: resultado.motivo } : {})
          });
        } catch (causa) {
          if (causa instanceof CodigoBarrasDuplicadoError || causa instanceof ProdutoDuplicadoError) {
            itens.push({ produtoBaseId, estado: "ignorado", motivo: causa.message });
            continue;
          }
          request.log.error({ evento: "produtos.catalogo_base.copia_lote_falhou", produtoBaseId, empresaId, causa });
          itens.push({
            produtoBaseId,
            estado: "erro",
            motivo: "Falha ao copiar este produto; os demais foram processados."
          });
        }
      }

      // O arquivo do PDV e o catalogo inteiro: o lote publica UMA vez no fim (oficial `importFromBase`).
      if (itens.some((item) => item.estado === "importado")) await publicarCreareDaEmpresaAposSalvar(empresaId);
      const contagem = (estado: string) => itens.filter((item) => item.estado === estado).length;
      return ok({
        total: itens.length,
        importados: contagem("importado"),
        jaImportados: contagem("ja_importado"),
        ignorados: contagem("ignorado"),
        bloqueados: contagem("bloqueado"),
        naoEncontrados: contagem("nao_encontrado"),
        erros: contagem("erro"),
        itens
      });
    }
  );

  app.post(
    "/api/produtos/catalogo-base/:produtoBaseId/importar",
    { preHandler: exigirPermissao("cadastro_produtos_criar") },
    async (request, reply) => {
      const { produtoBaseId } = produtoBaseParams.parse(request.params);
      const corpo = corpoCopiaBase.parse(request.body);
      const perfil = request.perfilUsuario;
      const empresaId = corpo.empresaId ?? perfil?.empresaId;
      const permitidas = perfil ? empresasPermitidas(perfil) : [];
      if (!empresaId || !permitidas.includes(empresaId)) {
        return erro(reply, 403, "Empresa de destino não permitida.", "FORBIDDEN_COMPANY");
      }
      try {
        const resultado = await copiarProdutoBaseParaLoja({
          produtoBaseId,
          empresaId,
          ator: { usuarioId: request.usuarioId, nome: perfil?.nome, empresasPermitidas: permitidas }
        });
        if (resultado.estado === "nao_encontrado") {
          return erro(reply, 404, "Produto não encontrado no catálogo mestre BASE.", "NOT_FOUND");
        }
        if (resultado.estado === "bloqueado") {
          return erro(reply, 422, resultado.motivo, "BASE_PRODUCT_MAPPING_REQUIRED");
        }
        if (resultado.estado === "ja_importado") {
          return ok({ estado: resultado.estado, mensagem: "Este produto da BASE já foi copiado para a loja." });
        }
        return ok(resultado);
      } catch (causa) {
        if (causa instanceof CodigoBarrasDuplicadoError || causa instanceof ProdutoDuplicadoError) {
          return ok({ estado: "ignorado", motivo: causa.message });
        }
        request.log.error({ evento: "produtos.catalogo_base.copia_falhou", produtoBaseId, empresaId, causa });
        return erro(
          reply,
          422,
          causa instanceof Error ? causa.message : "Não foi possível copiar o produto.",
          "BASE_PRODUCT_IMPORT_FAILED"
        );
      }
    }
  );
}
