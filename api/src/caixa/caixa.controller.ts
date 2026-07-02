import { mensagemDominioOuRelancar } from "../erros.js";
import type { FastifyInstance } from "fastify";
import {
  abrirCaixaPayloadSchema,
  acertarSaldoCaixaPayloadSchema,
  caixaParamsSchema,
  caixaStatusQuerySchema,
  editarAberturaCaixaPayloadSchema,
  fecharCaixaPayloadSchema,
  historicoCaixaQuerySchema
} from "@padaria/shared/caixa";
import { exigirPermissao } from "../auth/guards.js";
import { criadoId, erro, ok, paginadoDeArray, semConteudo } from "@padaria/shared/api";
import {
  abrirCaixa,
  acertarSaldoCaixaOperacional,
  editarAberturaCaixa,
  fecharCaixa,
  listarHistoricoCaixa,
  obterStatusCaixa
} from "./caixa.service.js";

function statusErro(mensagem: string) {
  if (mensagem === "Empresa nao permitida" || mensagem === "Caixa nao permitido") return 403;
  if (mensagem === "Caixa nao encontrado") return 404;
  return 400;
}

export async function registrarRotasCaixa(app: FastifyInstance): Promise<void> {
  app.get("/api/caixa/status", { preHandler: exigirPermissao("caixa_operar") }, async (request, reply) => {
    const query = caixaStatusQuerySchema.parse(request.query);
    try {
      return ok(await obterStatusCaixa(query.empresaId, request.perfilUsuario!));
    } catch (error) {
      const mensagem = mensagemDominioOuRelancar(error);
      return erro(reply, statusErro(mensagem), mensagem);
    }
  });

  app.post("/api/caixa/abrir", { preHandler: exigirPermissao("caixa_operar") }, async (request, reply) => {
    const body = abrirCaixaPayloadSchema.parse(request.body);
    try {
      const status = await abrirCaixa(body, request.perfilUsuario!);
      return criadoId(reply, status.caixaAberto?.id ?? body.pdvId);
    } catch (error) {
      const mensagem = mensagemDominioOuRelancar(error);
      return erro(reply, statusErro(mensagem), mensagem);
    }
  });

  app.put("/api/caixa/:caixaId/abertura", { preHandler: exigirPermissao("caixa_operar") }, async (request, reply) => {
    const { caixaId } = caixaParamsSchema.parse(request.params);
    const body = editarAberturaCaixaPayloadSchema.parse(request.body);
    try {
      await editarAberturaCaixa(caixaId, body, request.perfilUsuario!);
      return semConteudo(reply);
    } catch (error) {
      const mensagem = mensagemDominioOuRelancar(error);
      return erro(reply, statusErro(mensagem), mensagem);
    }
  });

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
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErro(mensagem), mensagem);
      }
    }
  );

  app.post("/api/caixa/:caixaId/fechar", { preHandler: exigirPermissao("caixa_operar") }, async (request, reply) => {
    const { caixaId } = caixaParamsSchema.parse(request.params);
    const body = fecharCaixaPayloadSchema.parse(request.body);
    try {
      await fecharCaixa(caixaId, body, request.perfilUsuario!);
      return semConteudo(reply);
    } catch (error) {
      const mensagem = mensagemDominioOuRelancar(error);
      return erro(reply, statusErro(mensagem), mensagem);
    }
  });

  app.get("/api/caixa/historico", { preHandler: exigirPermissao("caixas_gerenciar") }, async (request, reply) => {
    const query = historicoCaixaQuerySchema.parse(request.query);
    try {
      return paginadoDeArray(
        await listarHistoricoCaixa(query.empresaId, request.perfilUsuario!),
        query.page,
        query.pageSize
      );
    } catch (error) {
      const mensagem = mensagemDominioOuRelancar(error);
      return erro(reply, statusErro(mensagem), mensagem);
    }
  });
}
