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
    { preHandler: exigirPermissao("operar_caixa") },
    async (request, reply) => {
      const query = caixaStatusQuerySchema.parse(request.query);
      try {
        return await obterStatusCaixa(query.empresaId, request.perfilUsuario!);
      } catch (error) {
        const mensagem = error instanceof Error ? error.message : "Caixa invalido";
        return reply.status(statusErro(mensagem)).send({ erro: mensagem });
      }
    }
  );

  app.post(
    "/api/caixa/abrir",
    { preHandler: exigirPermissao("operar_caixa") },
    async (request, reply) => {
      const body = abrirCaixaPayloadSchema.parse(request.body);
      try {
        return reply.status(201).send(await abrirCaixa(body, request.perfilUsuario!));
      } catch (error) {
        const mensagem = error instanceof Error ? error.message : "Abertura invalida";
        return reply.status(statusErro(mensagem)).send({ erro: mensagem });
      }
    }
  );

  app.put(
    "/api/caixa/:caixaId/abertura",
    { preHandler: exigirPermissao("operar_caixa") },
    async (request, reply) => {
      const { caixaId } = caixaParamsSchema.parse(request.params);
      const body = editarAberturaCaixaPayloadSchema.parse(request.body);
      try {
        return await editarAberturaCaixa(caixaId, body, request.perfilUsuario!);
      } catch (error) {
        const mensagem = error instanceof Error ? error.message : "Edicao invalida";
        return reply.status(statusErro(mensagem)).send({ erro: mensagem });
      }
    }
  );

  app.post(
    "/api/caixa/:caixaId/acertar-saldo",
    { preHandler: exigirPermissao("operar_caixa") },
    async (request, reply) => {
      const { caixaId } = caixaParamsSchema.parse(request.params);
      const body = acertarSaldoCaixaPayloadSchema.parse(request.body);
      try {
        return reply.status(201).send(await acertarSaldoCaixaOperacional(caixaId, body, request.perfilUsuario!));
      } catch (error) {
        const mensagem = error instanceof Error ? error.message : "Acerto invalido";
        return reply.status(statusErro(mensagem)).send({ erro: mensagem });
      }
    }
  );

  app.post(
    "/api/caixa/:caixaId/fechar",
    { preHandler: exigirPermissao("operar_caixa") },
    async (request, reply) => {
      const { caixaId } = caixaParamsSchema.parse(request.params);
      const body = fecharCaixaPayloadSchema.parse(request.body);
      try {
        return await fecharCaixa(caixaId, body, request.perfilUsuario!);
      } catch (error) {
        const mensagem = error instanceof Error ? error.message : "Fechamento invalido";
        return reply.status(statusErro(mensagem)).send({ erro: mensagem });
      }
    }
  );

  app.get(
    "/api/caixa/historico",
    { preHandler: exigirPermissao("gerenciar_caixas") },
    async (request, reply) => {
      const query = historicoCaixaQuerySchema.parse(request.query);
      try {
        return await listarHistoricoCaixa(query.empresaId, request.perfilUsuario!);
      } catch (error) {
        const mensagem = error instanceof Error ? error.message : "Historico invalido";
        return reply.status(statusErro(mensagem)).send({ erro: mensagem });
      }
    }
  );

  app.get(
    "/api/fechamento-caixa/resumo",
    { preHandler: exigirPermissao("fechamento_com_diferenca") },
    async (request, reply) => {
      const query = resumoCaixaQuerySchema.parse(request.query);
      if (request.perfilUsuario && !podeAcessarEmpresa(request.perfilUsuario, query.empresaId)) {
        return reply.status(403).send({ erro: "Empresa nao permitida" });
      }

      return obterResumoCaixa(query);
    }
  );

  app.post(
    "/api/fechamento-caixa/acertar-saldo",
    { preHandler: exigirPermissao("fechamento_com_diferenca") },
    async (request, reply) => {
      const body = ajusteSaldoSchema.parse(request.body);
      if (request.perfilUsuario && !podeAcessarEmpresa(request.perfilUsuario, body.empresaId)) {
        return reply.status(403).send({ erro: "Empresa nao permitida" });
      }

      try {
        return reply.status(201).send(await acertarSaldoCaixa(body, request.usuarioId ?? ""));
      } catch (error) {
        return reply.status(400).send({ erro: error instanceof Error ? error.message : "Fechamento invalido" });
      }
    }
  );
}
