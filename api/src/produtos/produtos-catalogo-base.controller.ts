import type { FastifyInstance } from "fastify";
import { erro, ok } from "@padaria/shared/api";
import { z } from "zod";
import { exigirPermissao } from "../auth/guards.js";
import { empresasPermitidas } from "../auth/empresa.js";
import { CodigoBarrasDuplicadoError, ProdutoDuplicadoError } from "./produtos.service.js";
import { copiarProdutoBaseParaLoja, listarCatalogoBase } from "./produtos-catalogo-base.service.js";

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
            ator: { usuarioId: request.usuarioId, nome: perfil?.nome, empresasPermitidas: permitidas }
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
