import { createReadStream } from "node:fs";
import { mensagemDominioOuRelancar } from "../erros.js";
import type { FastifyInstance } from "fastify";
import {
  discriminarMercadoriaSchema,
  mercadoriaPayloadSchema,
  mercadoriasQuerySchema
} from "@padaria/shared/mercadorias";
import { exigirAlgumaPermissao, exigirPermissao } from "../auth/guards.js";
import { empresasPermitidas, escopoEmpresaAtiva, podeAcessarEmpresa } from "../auth/empresa.js";
import { apiIdParamsSchema, criadoId, erro, ok, paginadoDeArray } from "@padaria/shared/api";
import { PermissaoLancamentoInsuficienteError } from "../lancamentos/lancamentos.dominio.js";
import {
  atualizarMercadoria,
  criarMercadoria,
  discriminarMercadoria,
  listarMercadorias,
  obterFotoMercadoria,
  obterMercadoria,
  salvarFotoMercadoria
} from "./mercadorias.service.js";
import { statusErroValidacao } from "../utils.js";
import { resolverEscopoListagemPorCaixa } from "../caixa/caixa.service.js";

export async function registrarRotasMercadorias(app: FastifyInstance): Promise<void> {
  app.get("/api/mercadorias", { preHandler: exigirPermissao("mercadorias_visualizar") }, async (request, reply) => {
    const query = mercadoriasQuerySchema.parse(request.query);
    const empresasLiberadas = request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : [];
    let escopoDados: string[];
    try {
      escopoDados = escopoEmpresaAtiva(empresasLiberadas, query.empresaId);
    } catch {
      return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
    }
    // A fila "somente pendentes de discriminacao" e visao de RETAGUARDA: ignora a trava de caixa
    // aberto e lista os pendentes da empresa (inclui os criados pela NF-e, que nascem com caixa_id
    // NULL e ficariam invisiveis sob o filtro do caixa).
    const escopoCaixa = query.pendenteDiscriminacao
      ? { bloquear: false, caixaId: undefined }
      : await resolverEscopoListagemPorCaixa(request.perfilUsuario, "mercadorias", query.empresaId, query.caixaId);
    if (escopoCaixa.bloquear) return paginadoDeArray([], query.page, query.pageSize);
    const queryComCaixa = { ...query, caixaId: escopoCaixa.caixaId };
    return paginadoDeArray(await listarMercadorias(queryComCaixa, escopoDados), query.page, query.pageSize);
  });

  app.post("/api/mercadorias", { preHandler: exigirPermissao("mercadorias_criar") }, async (request, reply) => {
    const dados = mercadoriaPayloadSchema.parse(request.body);
    const perfil = request.perfilUsuario;
    if (!perfil) return erro(reply, 401, "Nao autenticado", "UNAUTHENTICATED");
    if (!podeAcessarEmpresa(perfil, dados.empresaId)) {
      return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
    }
    try {
      const mercadoria = await criarMercadoria(dados, perfil);
      return criadoId(reply, mercadoria.id);
    } catch (error) {
      if (error instanceof PermissaoLancamentoInsuficienteError) {
        return erro(reply, 403, error.message, "INSUFFICIENT_PERMISSION", { permissao: error.permissao });
      }
      return erro(reply, 400, mensagemDominioOuRelancar(error));
    }
  });

  app.get("/api/mercadorias/:id", { preHandler: exigirPermissao("mercadorias_visualizar") }, async (request, reply) => {
    const { id } = apiIdParamsSchema.parse(request.params);
    try {
      return ok(await obterMercadoria(id, request.perfilUsuario!));
    } catch (error) {
      const mensagem = mensagemDominioOuRelancar(error);
      return erro(reply, statusErroValidacao(mensagem), mensagem);
    }
  });

  app.put("/api/mercadorias/:id", { preHandler: exigirPermissao("mercadorias_editar") }, async (request, reply) => {
    const { id } = apiIdParamsSchema.parse(request.params);
    const dados = mercadoriaPayloadSchema.parse(request.body);
    const perfil = request.perfilUsuario;
    if (!perfil) return erro(reply, 401, "Nao autenticado", "UNAUTHENTICATED");
    if (!podeAcessarEmpresa(perfil, dados.empresaId)) {
      return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
    }
    try {
      return ok(await atualizarMercadoria(id, dados, perfil));
    } catch (error) {
      if (error instanceof PermissaoLancamentoInsuficienteError) {
        return erro(reply, 403, error.message, "INSUFFICIENT_PERMISSION", { permissao: error.permissao });
      }
      const mensagem = mensagemDominioOuRelancar(error);
      return erro(reply, statusErroValidacao(mensagem), mensagem);
    }
  });

  // Anexo de foto do documento: upload (gerente ao lancar) e download (retaguarda ao discriminar).
  app.post(
    "/api/mercadorias/:id/foto",
    { preHandler: exigirAlgumaPermissao(["mercadorias_criar", "mercadorias_editar"]) },
    async (request, reply) => {
      const { id } = apiIdParamsSchema.parse(request.params);
      try {
        const arquivo = await request.file({ limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
        return reply.status(201).send(ok(await salvarFotoMercadoria(id, arquivo, request.perfilUsuario!)));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErroValidacao(mensagem), mensagem);
      }
    }
  );

  app.get(
    "/api/mercadorias/:id/foto",
    { preHandler: exigirPermissao("mercadorias_visualizar") },
    async (request, reply) => {
      const { id } = apiIdParamsSchema.parse(request.params);
      try {
        const { caminhoAbsoluto, mimeType } = await obterFotoMercadoria(id, request.perfilUsuario!);
        reply.header("Content-Type", mimeType);
        reply.header("Cache-Control", "private, max-age=300");
        return reply.send(createReadStream(caminhoAbsoluto));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErroValidacao(mensagem), mensagem);
      }
    }
  );

  app.patch(
    "/api/mercadorias/:id/discriminar",
    { preHandler: exigirPermissao("mercadorias_discriminar") },
    async (request, reply) => {
      const { id } = apiIdParamsSchema.parse(request.params);
      const dados = discriminarMercadoriaSchema.parse(request.body);
      const perfil = request.perfilUsuario;
      if (!perfil) return erro(reply, 401, "Nao autenticado", "UNAUTHENTICATED");
      if (!podeAcessarEmpresa(perfil, dados.empresaId)) {
        return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
      }
      try {
        return ok(await discriminarMercadoria(id, dados, perfil));
      } catch (error) {
        if (error instanceof PermissaoLancamentoInsuficienteError) {
          return erro(reply, 403, error.message, "INSUFFICIENT_PERMISSION", { permissao: error.permissao });
        }
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErroValidacao(mensagem), mensagem);
      }
    }
  );
}
