import type { FastifyInstance } from "fastify";
import {
  analisarImportacaoPrecoBaseSchema,
  aplicarImportacaoPrecoBaseSchema,
  catalogoFornecedorDecisaoSchema,
  catalogoFornecedorPayloadSchema,
  catalogoFornecedorQuerySchema,
  importacaoPrecoBaseDetalheQuerySchema,
  importacoesPrecoBaseQuerySchema,
  precosBaseQuerySchema
} from "@padaria/shared/compras";
import { apiIdParamsSchema, criadoId, ok, semConteudo } from "@padaria/shared/api";
import { exigirPermissao } from "../auth/guards.js";
import { erroValidacao } from "../erros.js";
import { env } from "../env.js";
import { linhasDePrecoBaseDoXlsx } from "./compras-preco-base-xlsx.js";
import {
  analisarImportacaoPrecoBase,
  aplicarImportacaoPrecoBase,
  criarVinculoCatalogo,
  decidirVinculoCatalogo,
  descartarImportacaoPrecoBase,
  detalharImportacaoPrecoBase,
  listarCatalogoFornecedor,
  listarImportacoesPrecoBase,
  listarPrecosBaseAtuais
} from "./compras-fundacao.service.js";

export async function registrarRotasComprasFundacao(app: FastifyInstance): Promise<void> {
  app.get("/api/compras/fundacao/status", { preHandler: exigirPermissao("pedidos_visualizar") }, async () =>
    ok({ habilitado: env.COMPRAS_NOVO_FLUXO })
  );
  if (!env.COMPRAS_NOVO_FLUXO) return;

  app.get(
    "/api/compras/catalogo-fornecedores",
    { preHandler: exigirPermissao("compras_catalogo_gerir") },
    async (request) =>
      ok(await listarCatalogoFornecedor(catalogoFornecedorQuerySchema.parse(request.query), request.perfilUsuario!))
  );
  app.post(
    "/api/compras/catalogo-fornecedores",
    { preHandler: exigirPermissao("compras_catalogo_gerir") },
    async (request, reply) => {
      const criado = await criarVinculoCatalogo(
        catalogoFornecedorPayloadSchema.parse(request.body),
        request.perfilUsuario!,
        request.usuarioId!
      );
      return criadoId(reply, criado.id);
    }
  );
  app.put(
    "/api/compras/catalogo-fornecedores/:id/decisao",
    { preHandler: exigirPermissao("compras_catalogo_gerir") },
    async (request, reply) => {
      const { id } = apiIdParamsSchema.parse(request.params);
      await decidirVinculoCatalogo(
        id,
        catalogoFornecedorDecisaoSchema.parse(request.body),
        request.perfilUsuario!,
        request.usuarioId!
      );
      return semConteudo(reply);
    }
  );

  app.get(
    "/api/compras/precos-base",
    { preHandler: exigirPermissao("compras_preco_base_importar") },
    async (request) => {
      const { empresaId, limite } = precosBaseQuerySchema.parse(request.query);
      return ok(await listarPrecosBaseAtuais(empresaId, request.perfilUsuario!, limite));
    }
  );
  app.get(
    "/api/compras/precos-base/importacoes",
    { preHandler: exigirPermissao("compras_preco_base_importar") },
    async (request) => {
      const { empresaId } = importacoesPrecoBaseQuerySchema.parse(request.query);
      return ok(await listarImportacoesPrecoBase(empresaId, request.perfilUsuario!));
    }
  );
  app.get(
    "/api/compras/precos-base/importacoes/:id",
    { preHandler: exigirPermissao("compras_preco_base_importar") },
    async (request) => {
      const { id } = apiIdParamsSchema.parse(request.params);
      const { empresaId, somentePendencias } = importacaoPrecoBaseDetalheQuerySchema.parse(request.query);
      return ok(await detalharImportacaoPrecoBase(id, empresaId, request.perfilUsuario!, { somentePendencias }));
    }
  );
  app.post(
    "/api/compras/precos-base/importacoes/analisar",
    { preHandler: exigirPermissao("compras_preco_base_importar") },
    async (request, reply) => {
      const analisada = await analisarImportacaoPrecoBase(
        analisarImportacaoPrecoBaseSchema.parse(request.body),
        request.perfilUsuario!,
        request.usuarioId!
      );
      return criadoId(reply, analisada.id);
    }
  );
  app.post(
    "/api/compras/precos-base/importacoes/analisar-arquivo",
    { preHandler: exigirPermissao("compras_preco_base_importar") },
    async (request, reply) => {
      const { empresaId } = importacoesPrecoBaseQuerySchema.parse(request.query);
      const arquivo = await request.file({ limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0 } });
      if (!arquivo) throw erroValidacao("Arquivo .xlsx obrigatorio", "PRICE_BASE_FILE_REQUIRED");
      if (!arquivo.filename.toLocaleLowerCase("pt-BR").endsWith(".xlsx"))
        throw erroValidacao("Envie uma planilha no formato .xlsx", "PRICE_BASE_FILE_TYPE");
      const buffer = await arquivo.toBuffer();
      let extraido;
      try {
        extraido = linhasDePrecoBaseDoXlsx(buffer);
      } catch (erro) {
        // O 400 de arquivo invalido sai sem passar pelo log do handler global. Registrar aqui e o que
        // permite diferenciar "o operador mandou um arquivo ruim" de "a leitura do ZIP tem um bug e
        // esta recusando planilha legitima" — no segundo caso, sem rastro, ninguem descobriria.
        request.log.warn({ erro, arquivo: arquivo.filename }, "planilha de preco-base recusada");
        throw erro;
      }
      const analisada = await analisarImportacaoPrecoBase(
        // Passa pelo MESMO contrato da rota JSON. Esta rota montava o payload a mao e escapava dele:
        // nome de arquivo sem teto, descricao vazia e custo acima de `numeric(14,4)` chegavam ao
        // banco e voltavam como 500.
        analisarImportacaoPrecoBaseSchema.parse({
          empresaId,
          nomeArquivo: arquivo.filename.slice(-255),
          hashArquivo: extraido.hashArquivo,
          linhas: extraido.linhas
        }),
        request.perfilUsuario!,
        request.usuarioId!
      );
      return criadoId(reply, analisada.id);
    }
  );
  app.delete(
    "/api/compras/precos-base/importacoes/:id",
    { preHandler: exigirPermissao("compras_preco_base_importar") },
    async (request, reply) => {
      const { id } = apiIdParamsSchema.parse(request.params);
      const { empresaId } = importacoesPrecoBaseQuerySchema.parse(request.query);
      await descartarImportacaoPrecoBase(id, empresaId, request.perfilUsuario!);
      return semConteudo(reply);
    }
  );
  app.post(
    "/api/compras/precos-base/importacoes/:id/aplicar",
    { preHandler: exigirPermissao("compras_preco_base_importar") },
    async (request) => {
      const { id } = apiIdParamsSchema.parse(request.params);
      const { empresaId } = aplicarImportacaoPrecoBaseSchema.parse(request.body);
      return ok(await aplicarImportacaoPrecoBase(id, empresaId, request.perfilUsuario!, request.usuarioId!));
    }
  );
}
