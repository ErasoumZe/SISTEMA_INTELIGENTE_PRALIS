import { mensagemDominioOuRelancar } from "../erros.js";
import type { FastifyInstance } from "fastify";
import { createReadStream } from "node:fs";
import { z } from "zod";
import {
  confirmarTransferenciaPayloadSchema,
  recusarConferenciaPayloadSchema,
  transferenciaPayloadSchema,
  transferenciaSemLacrePayloadSchema,
  transferenciasQuerySchema
} from "@padaria/shared/transferencias";
import { exigirPermissao } from "../auth/guards.js";
import { empresasPermitidas, escopoEmpresaAtiva, podeAcessarEmpresa } from "../auth/empresa.js";
import { apiIdParamsSchema, criadoId, erro, ok, paginadoDeArray, paginadoDeResultado } from "@padaria/shared/api";
import { temPermissao } from "@padaria/shared/autenticacao";
import { PermissaoLancamentoInsuficienteError } from "../lancamentos/lancamentos.dominio.js";
import {
  atualizarTransferencia,
  confirmarTransferencia,
  criarTransferencia,
  criarTransferenciaSemLacre,
  liberarTravaTransferencia,
  listarTransferencias,
  listarAnexosDaConferencia,
  obterResumoFechamentoDaConferencia,
  obterAnexoDaConferencia,
  obterTransferencia,
  recusarConferencia
} from "./transferencias.service.js";
import { statusErroValidacao } from "../utils.js";
import { resolverEscopoListagemPorCaixa } from "../caixa/caixa.service.js";

export async function registrarRotasTransferencias(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/transferencias",
    { preHandler: exigirPermissao("transferencias_visualizar") },
    async (request, reply) => {
      const query = transferenciasQuerySchema.parse(request.query);
      const empresasLiberadas = request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : [];
      let escopoDados: string[];
      try {
        escopoDados = escopoEmpresaAtiva(empresasLiberadas, query.empresaId);
      } catch {
        return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
      }
      const escopoCaixa = await resolverEscopoListagemPorCaixa(
        request.perfilUsuario,
        "transferencias",
        query.empresaId,
        query.caixaId
      );
      if (escopoCaixa.bloquear) return paginadoDeArray([], query.page, query.pageSize);
      const queryComCaixa = { ...query, caixaId: escopoCaixa.caixaId };
      // O numero dos lacres AINDA NAO rompidos (fechamento e bolsas) e o segredo fisico do posto: so quem
      // confere ou cadastra lacre o le, e nunca quem esta preso ao proprio caixa. Os demais veem so a situacao.
      const permissoes = request.perfilUsuario?.permissoes;
      const presoAoProprioCaixa = temPermissao(permissoes, "menu_transferencias_somente_caixa_aberto");
      const mostrarNumerosLacre =
        !presoAoProprioCaixa &&
        (temPermissao(permissoes, "transferencias_conferir") || temPermissao(permissoes, "cadastro_lacres_visualizar"));
      const resultado = await listarTransferencias(queryComCaixa, escopoDados, {
        page: query.page,
        pageSize: query.pageSize,
        mostrarNumerosLacre
      });
      return paginadoDeResultado({
        itens: resultado.itens,
        total: resultado.total,
        page: query.page,
        pageSize: query.pageSize
      });
    }
  );

  // R-231 · transferencia sem lacre (suprimento no meio do turno). Permissao propria; o servico valida o resto.
  app.post(
    "/api/transferencias/sem-lacre",
    { preHandler: exigirPermissao("transferencias_sem_lacre") },
    async (request, reply) => {
      const perfil = request.perfilUsuario;
      if (!perfil) return erro(reply, 401, "Nao autenticado", "UNAUTHENTICATED");
      const dados = transferenciaSemLacrePayloadSchema.parse(request.body);
      if (!podeAcessarEmpresa(perfil, dados.empresaId)) {
        return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
      }
      try {
        const transferencia = await criarTransferenciaSemLacre(dados, perfil);
        return criadoId(reply, transferencia.id);
      } catch (error) {
        if (error instanceof PermissaoLancamentoInsuficienteError) {
          return erro(reply, 403, error.message, "INSUFFICIENT_PERMISSION", { permissao: error.permissao });
        }
        return erro(reply, 400, mensagemDominioOuRelancar(error));
      }
    }
  );

  app.post("/api/transferencias", { preHandler: exigirPermissao("transferencias_criar") }, async (request, reply) => {
    const dados = transferenciaPayloadSchema.parse(request.body);
    const perfil = request.perfilUsuario;
    if (!perfil) return erro(reply, 401, "Nao autenticado", "UNAUTHENTICATED");
    if (!podeAcessarEmpresa(perfil, dados.empresaId)) {
      return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
    }
    try {
      const transferencia = await criarTransferencia(dados, perfil);
      return criadoId(reply, transferencia.id);
    } catch (error) {
      if (error instanceof PermissaoLancamentoInsuficienteError) {
        return erro(reply, 403, error.message, "INSUFFICIENT_PERMISSION", { permissao: error.permissao });
      }
      return erro(reply, 400, mensagemDominioOuRelancar(error));
    }
  });

  app.get(
    "/api/transferencias/:id",
    { preHandler: exigirPermissao("transferencias_visualizar") },
    async (request, reply) => {
      const { id } = apiIdParamsSchema.parse(request.params);
      try {
        return ok(await obterTransferencia(id, request.perfilUsuario!));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErroValidacao(mensagem), mensagem);
      }
    }
  );

  app.get(
    "/api/transferencias/:id/anexos-fechamento",
    { preHandler: exigirPermissao("transferencias_conferir") },
    async (request, reply) => {
      const { id } = apiIdParamsSchema.parse(request.params);
      try {
        return ok(await listarAnexosDaConferencia(id, request.perfilUsuario!));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErroValidacao(mensagem), mensagem);
      }
    }
  );

  app.get(
    "/api/transferencias/:id/fechamento-conferencia",
    { preHandler: exigirPermissao("transferencias_conferir") },
    async (request, reply) => {
      const { id } = apiIdParamsSchema.parse(request.params);
      try {
        return ok(await obterResumoFechamentoDaConferencia(id, request.perfilUsuario!));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErroValidacao(mensagem), mensagem);
      }
    }
  );

  app.get(
    "/api/transferencias/:id/anexos-fechamento/:anexoId",
    { preHandler: exigirPermissao("transferencias_conferir") },
    async (request, reply) => {
      const { id } = apiIdParamsSchema.parse(request.params);
      const anexoId = z
        .string()
        .uuid()
        .parse((request.params as { anexoId?: string }).anexoId);
      try {
        const anexo = await obterAnexoDaConferencia(id, anexoId, request.perfilUsuario!);
        reply.header("Content-Type", anexo.mimeType);
        const nomeSeguro = anexo.nomeOriginal.replace(/[^\w. -]/gu, "_");
        reply.header("Content-Disposition", `inline; filename="${nomeSeguro || "anexo"}"`);
        reply.header("Cache-Control", "private, no-store");
        return reply.send(createReadStream(anexo.caminhoAbsoluto));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErroValidacao(mensagem), mensagem);
      }
    }
  );

  app.put(
    "/api/transferencias/:id",
    { preHandler: exigirPermissao("transferencias_editar") },
    async (request, reply) => {
      const { id } = apiIdParamsSchema.parse(request.params);
      const dados = transferenciaPayloadSchema.parse(request.body);
      const perfil = request.perfilUsuario;
      if (!perfil) return erro(reply, 401, "Nao autenticado", "UNAUTHENTICATED");
      if (!podeAcessarEmpresa(perfil, dados.empresaId)) {
        return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
      }
      try {
        return ok(await atualizarTransferencia(id, dados, perfil));
      } catch (error) {
        if (error instanceof PermissaoLancamentoInsuficienteError) {
          return erro(reply, 403, error.message, "INSUFFICIENT_PERMISSION", { permissao: error.permissao });
        }
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErroValidacao(mensagem), mensagem);
      }
    }
  );

  app.post(
    "/api/transferencias/:id/confirmar",
    { preHandler: exigirPermissao("transferencias_conferir") },
    async (request, reply) => {
      const { id } = apiIdParamsSchema.parse(request.params);
      const dados = confirmarTransferenciaPayloadSchema.parse(request.body);
      try {
        return ok(await confirmarTransferencia(id, dados, request.perfilUsuario!));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErroValidacao(mensagem), mensagem);
      }
    }
  );

  // Decisao 8 · recusa auditavel, exclusiva do fluxo Caixa -> Cofre. Rota SEPARADA do `/confirmar`
  // de proposito: a recusa precisa ser commitada com motivo, e sinaliza-la por excecao dentro do
  // confirmar faria o rollback apagar o proprio registro auditavel.
  // Desfecho e 200 "divergencia registrada" — nunca sucesso de confirmacao.
  app.post(
    "/api/transferencias/:id/recusar-conferencia",
    { preHandler: exigirPermissao("transferencias_conferir") },
    async (request, reply) => {
      const { id } = apiIdParamsSchema.parse(request.params);
      const dados = recusarConferenciaPayloadSchema.parse(request.body);
      try {
        return ok(await recusarConferencia(id, dados, request.perfilUsuario!));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErroValidacao(mensagem), mensagem);
      }
    }
  );

  app.put("/api/transferencias/:id/liberar-trava", async (request, reply) => {
    const { id } = apiIdParamsSchema.parse(request.params);
    try {
      return ok(await liberarTravaTransferencia(id, request.perfilUsuario!));
    } catch (error) {
      const mensagem = mensagemDominioOuRelancar(error);
      return erro(reply, statusErroValidacao(mensagem), mensagem);
    }
  });
}
