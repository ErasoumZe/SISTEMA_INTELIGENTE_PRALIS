import type { FastifyInstance } from "fastify";
import {
  abrirCaixaPayloadSchema,
  acertarSaldoCaixaPayloadSchema,
  ajusteSaldoSchema,
  caixaParamsSchema,
  caixaStatusQuerySchema,
  editarAberturaCaixaPayloadSchema,
  fecharCaixaPayloadSchema,
  historicoCaixaQuerySchema,
  resumoCaixaQuerySchema
} from "@padaria/shared/caixa";
import { exigirPermissao } from "../autorizacao.js";
import { podeAcessarEmpresa } from "../autorizacao/empresa.js";
import { criadoId, erro, ok, paginadoDeArray, semConteudo } from "../respostas.js";
import {
  abrirCaixa,
  acertarSaldoCaixa,
  acertarSaldoCaixaOperacional,
  editarAberturaCaixa,
  fecharCaixa,
  listarHistoricoCaixa,
  obterResumoCaixa,
  obterStatusCaixa
} from "./caixa.service.js";

function statusErro(mensagem: string) {
  if (mensagem === "Empresa nao permitida" || mensagem === "Caixa nao permitido") return 403;
  if (mensagem === "Caixa nao encontrado") return 404;
  return 400;
}

export async function registrarRotasCaixa(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/caixa/status",
    { preHandler: exigirPermissao("caixa_operar") },
    async (request, reply) => {
      const query = caixaStatusQuerySchema.parse(request.query);
      try {
        return ok(await obterStatusCaixa(query.empresaId, request.perfilUsuario!));
      } catch (error) {
        const mensagem = error instanceof Error ? error.message : "Caixa invalido";
        return erro(reply, statusErro(mensagem), mensagem);
      }
    }
  );

  app.post(
    "/api/caixa/abrir",
    { preHandler: exigirPermissao("caixa_operar") },
    async (request, reply) => {
      const body = abrirCaixaPayloadSchema.parse(request.body);
      try {
        const status = await abrirCaixa(body, request.perfilUsuario!);
        return criadoId(reply, status.caixaAberto?.id ?? body.pdvId);
      } catch (error) {
        const mensagem = error instanceof Error ? error.message : "Abertura invalida";
        return erro(reply, statusErro(mensagem), mensagem);
      }
    }
  );

  app.put(
    "/api/caixa/:caixaId/abertura",
    { preHandler: exigirPermissao("caixa_operar") },
    async (request, reply) => {
      const { caixaId } = caixaParamsSchema.parse(request.params);
      const body = editarAberturaCaixaPayloadSchema.parse(request.body);
      try {
        await editarAberturaCaixa(caixaId, body, request.perfilUsuario!);
        return semConteudo(reply);
      } catch (error) {
        const mensagem = error instanceof Error ? error.message : "Edicao invalida";
        return erro(reply, statusErro(mensagem), mensagem);
      }
    }
  );

  app.post(
    "/api/caixa/:caixaId/acertar-saldo",
    { preHandler: exigirPermissao("caixa_operar") },
    async (request, reply) => {
      const { caixaId } = caixaParamsSchema.parse(request.params);
      const body = acertarSaldoCaixaPayloadSchema.parse(request.body);
      try {
        const acerto = await acertarSaldoCaixaOperacional(caixaId, body, request.perfilUsuario!);
        return criadoId(reply, acerto.despesaId);
      } catch (error) {
        const mensagem = error instanceof Error ? error.message : "Acerto invalido";
        return erro(reply, statusErro(mensagem), mensagem);
      }
    }
  );

  app.post(
    "/api/caixa/:caixaId/fechar",
    { preHandler: exigirPermissao("caixa_operar") },
    async (request, reply) => {
      const { caixaId } = caixaParamsSchema.parse(request.params);
      const body = fecharCaixaPayloadSchema.parse(request.body);
      try {
        await fecharCaixa(caixaId, body, request.perfilUsuario!);
        return semConteudo(reply);
      } catch (error) {
        const mensagem = error instanceof Error ? error.message : "Fechamento invalido";
        return erro(reply, statusErro(mensagem), mensagem);
      }
    }
  );

  app.get(
    "/api/caixa/historico",
    { preHandler: exigirPermissao("caixas_gerenciar") },
    async (request, reply) => {
      const query = historicoCaixaQuerySchema.parse(request.query);
      try {
        return paginadoDeArray(
          await listarHistoricoCaixa(query.empresaId, request.perfilUsuario!),
          query.page,
          query.pageSize
        );
      } catch (error) {
        const mensagem = error instanceof Error ? error.message : "Historico invalido";
        return erro(reply, statusErro(mensagem), mensagem);
      }
    }
  );

  app.get(
    "/api/fechamento-caixa/resumo",
    { preHandler: exigirPermissao("fechamento_com_diferenca_visualizar") },
    async (request, reply) => {
      const query = resumoCaixaQuerySchema.parse(request.query);
      if (request.perfilUsuario && !podeAcessarEmpresa(request.perfilUsuario, query.empresaId)) {
        return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
      }

      return ok(await obterResumoCaixa(query));
    }
  );

  app.post(
    "/api/fechamento-caixa/acertar-saldo",
    { preHandler: exigirPermissao("fechamento_com_diferenca_visualizar") },
    async (request, reply) => {
      const body = ajusteSaldoSchema.parse(request.body);
      if (request.perfilUsuario && !podeAcessarEmpresa(request.perfilUsuario, body.empresaId)) {
        return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
      }

      try {
        const acerto = await acertarSaldoCaixa(body, request.usuarioId ?? "");
        return criadoId(reply, acerto.despesaId);
      } catch (error) {
        return erro(reply, 400, error instanceof Error ? error.message : "Fechamento invalido");
      }
    }
  );
}
