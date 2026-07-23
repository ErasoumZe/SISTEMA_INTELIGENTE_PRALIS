import { createReadStream } from "node:fs";
import { mensagemDominioOuRelancar } from "../erros.js";
import type { FastifyInstance } from "fastify";
import { despesaPayloadSchema, despesasQuerySchema, discriminarDespesaSchema } from "@padaria/shared/despesas";
import { exigirAlgumaPermissao, exigirPermissao } from "../auth/guards.js";
import { empresasPermitidas, escopoEmpresaAtiva, podeAcessarEmpresa } from "../auth/empresa.js";
import { apiIdParamsSchema, criadoId, erro, ok, paginadoDeArray } from "@padaria/shared/api";
import { PermissaoLancamentoInsuficienteError } from "../lancamentos/lancamentos.dominio.js";
import {
  atualizarDespesa,
  criarDespesa,
  discriminarDespesa,
  listarDespesas,
  obterDespesa,
  obterFotoDespesa,
  salvarFotoDespesa
} from "./despesas.service.js";
import { statusErroValidacao } from "../utils.js";
import { resolverEscopoListagemPorCaixa } from "../caixa/caixa.service.js";

export async function registrarRotasDespesas(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/despesas",
    { preHandler: exigirAlgumaPermissao(["despesas_visualizar", "contas_pagar_visualizar"]) },
    async (request, reply) => {
      const query = despesasQuerySchema.parse(request.query);
      const empresasLiberadas = request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : [];
      let escopoDados: string[];
      try {
        escopoDados = escopoEmpresaAtiva(empresasLiberadas, query.empresaId);
      } catch {
        return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
      }
      // A fila "somente pendentes de discriminacao" e visao de RETAGUARDA: ignora a trava de caixa
      // aberto e lista os pendentes da empresa (paridade com mercadorias/NF-e).
      const escopoCaixa = query.pendenteDiscriminacao
        ? { bloquear: false, caixaId: undefined }
        : await resolverEscopoListagemPorCaixa(request.perfilUsuario, "despesas", query.empresaId, query.caixaId);
      if (escopoCaixa.bloquear) return paginadoDeArray([], query.page, query.pageSize);
      const queryComCaixa = { ...query, caixaId: escopoCaixa.caixaId };
      return paginadoDeArray(
        await listarDespesas(queryComCaixa, escopoDados, request.perfilUsuario),
        query.page,
        query.pageSize
      );
    }
  );

  app.post("/api/despesas", { preHandler: exigirPermissao("despesas_criar") }, async (request, reply) => {
    const dados = despesaPayloadSchema.parse(request.body);
    const perfil = request.perfilUsuario;
    if (!perfil) return erro(reply, 401, "Nao autenticado", "UNAUTHENTICATED");
    if (!podeAcessarEmpresa(perfil, dados.empresaId)) {
      return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
    }
    try {
      const despesa = await criarDespesa(dados, perfil);
      return criadoId(reply, despesa.id);
    } catch (error) {
      if (error instanceof PermissaoLancamentoInsuficienteError) {
        return erro(reply, 403, error.message, "INSUFFICIENT_PERMISSION", { permissao: error.permissao });
      }
      return erro(reply, 400, mensagemDominioOuRelancar(error));
    }
  });

  app.get("/api/despesas/:id", { preHandler: exigirPermissao("despesas_visualizar") }, async (request, reply) => {
    const { id } = apiIdParamsSchema.parse(request.params);
    try {
      return ok(await obterDespesa(id, request.perfilUsuario!));
    } catch (error) {
      const mensagem = mensagemDominioOuRelancar(error);
      return erro(reply, statusErroValidacao(mensagem), mensagem);
    }
  });

  app.put("/api/despesas/:id", { preHandler: exigirPermissao("despesas_editar") }, async (request, reply) => {
    const { id } = apiIdParamsSchema.parse(request.params);
    const dados = despesaPayloadSchema.parse(request.body);
    const perfil = request.perfilUsuario;
    if (!perfil) return erro(reply, 401, "Nao autenticado", "UNAUTHENTICATED");
    if (!podeAcessarEmpresa(perfil, dados.empresaId)) {
      return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
    }
    try {
      return ok(await atualizarDespesa(id, dados, perfil));
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
    "/api/despesas/:id/foto",
    { preHandler: exigirAlgumaPermissao(["despesas_criar", "despesas_editar"]) },
    async (request, reply) => {
      const { id } = apiIdParamsSchema.parse(request.params);
      try {
        const arquivo = await request.file({ limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
        return reply.status(201).send(ok(await salvarFotoDespesa(id, arquivo, request.perfilUsuario!)));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErroValidacao(mensagem), mensagem);
      }
    }
  );

  app.get("/api/despesas/:id/foto", { preHandler: exigirPermissao("despesas_visualizar") }, async (request, reply) => {
    const { id } = apiIdParamsSchema.parse(request.params);
    try {
      const { caminhoAbsoluto, mimeType } = await obterFotoDespesa(id, request.perfilUsuario!);
      reply.header("Content-Type", mimeType);
      reply.header("Cache-Control", "private, max-age=300");
      return reply.send(createReadStream(caminhoAbsoluto));
    } catch (error) {
      const mensagem = mensagemDominioOuRelancar(error);
      return erro(reply, statusErroValidacao(mensagem), mensagem);
    }
  });

  app.patch(
    "/api/despesas/:id/discriminar",
    { preHandler: exigirPermissao("despesas_discriminar") },
    async (request, reply) => {
      const { id } = apiIdParamsSchema.parse(request.params);
      const dados = discriminarDespesaSchema.parse(request.body);
      const perfil = request.perfilUsuario;
      if (!perfil) return erro(reply, 401, "Nao autenticado", "UNAUTHENTICATED");
      if (!podeAcessarEmpresa(perfil, dados.empresaId)) {
        return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
      }
      try {
        return ok(await discriminarDespesa(id, dados, perfil));
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
