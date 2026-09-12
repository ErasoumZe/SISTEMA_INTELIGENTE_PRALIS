import { mensagemDominioOuRelancar } from "../erros.js";
import type { FastifyInstance } from "fastify";
import {
  abrirCaixaPayloadSchema,
  cancelarPlanejamentoRetornoPayloadSchema,
  caixaParamsSchema,
  caixaStatusQuerySchema,
  planejamentoRetornoIdParamsSchema,
  planejamentoRetornoParamsSchema,
  fecharCaixaPayloadSchema,
  historicoCaixaQuerySchema,
  transferenciaCofrePayloadSchema
} from "@padaria/shared/caixa";
import { exigirAlgumaPermissao, exigirPermissao } from "../auth/guards.js";
import { criadoId, erro, ok, paginadoDeResultado, semConteudo } from "@padaria/shared/api";
import {
  abrirCaixa,
  criarTransferenciaCofreCaixa,
  cancelarPlanejamentoRetorno,
  executarPlanejamentoRetorno,
  fecharCaixa,
  listarHistoricoCaixa,
  listarPlanejamentosRetorno,
  obterDetalheCaixa,
  obterStatusCaixa,
  obterTransferenciasCaixa
} from "./caixa.service.js";

function statusErro(mensagem: string) {
  if (mensagem === "Empresa nao permitida" || mensagem === "Caixa nao permitido") return 403;
  if (mensagem === "Caixa nao encontrado" || mensagem === "Planejamento nao encontrado") return 404;
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

  // R-187: Transferencia de retorno avulsa/final do Caixa para o Cofre.
  app.post(
    "/api/caixa/:caixaId/transferencia-cofre",
    { preHandler: exigirPermissao("caixa_operar") },
    async (request, reply) => {
      const { caixaId } = caixaParamsSchema.parse(request.params);
      const body = transferenciaCofrePayloadSchema.parse(request.body);
      try {
        return ok(await criarTransferenciaCofreCaixa(caixaId, body, request.perfilUsuario!));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErro(mensagem), mensagem);
      }
    }
  );

  app.get(
    "/api/caixa/:caixaId/planejamentos-retorno",
    { preHandler: exigirAlgumaPermissao(["caixa_operar", "caixas_gerenciar"]) },
    async (request, reply) => {
      const { caixaId } = caixaParamsSchema.parse(request.params);
      try {
        return ok(await listarPlanejamentosRetorno(caixaId, request.perfilUsuario!));
      } catch (error) {
        return erro(reply, statusErro(mensagemDominioOuRelancar(error)), mensagemDominioOuRelancar(error));
      }
    }
  );
  app.post(
    "/api/caixa/:caixaId/planejamentos-retorno/:planejamentoId/executar",
    { preHandler: exigirPermissao("caixa_operar") },
    async (request, reply) => {
      const { caixaId, planejamentoId } = planejamentoRetornoParamsSchema.parse(request.params);
      try {
        return ok(await executarPlanejamentoRetorno(caixaId, planejamentoId, request.perfilUsuario!));
      } catch (error) {
        return erro(reply, statusErro(mensagemDominioOuRelancar(error)), mensagemDominioOuRelancar(error));
      }
    }
  );
  app.post(
    "/api/caixa/planejamentos-retorno/:planejamentoId/cancelar",
    { preHandler: exigirPermissao("transferencias_criar") },
    async (request, reply) => {
      const { planejamentoId } = planejamentoRetornoIdParamsSchema.parse(request.params);
      const body = cancelarPlanejamentoRetornoPayloadSchema.parse(request.body);
      try {
        return ok(await cancelarPlanejamentoRetorno(planejamentoId, body, request.perfilUsuario!));
      } catch (error) {
        return erro(reply, statusErro(mensagemDominioOuRelancar(error)), mensagemDominioOuRelancar(error));
      }
    }
  );

  // R-179/Fatia 3 · aqui viviam as quatro rotas de "Programar entrega ao cofre" (D4):
  // `GET /api/caixa/abertos`, `POST`/`GET /api/caixa/:caixaId/solicitacoes-cofre` e os sufixos
  // `/cancelar` e `/executar`. Elas eram o segundo caminho para o mesmo ato de
  // `POST /api/caixa/:caixaId/transferencia-cofre`: mesma entidade, mesmas contas, outra porta.
  // A porta foi fechada, nao escondida — `entrega-cofre-caminho-unico.test.ts` prova o 404.
  // `/api/caixa/abertos` saiu junto porque so existia para a retaguarda escolher o caixa da ordem.

  // M2 (item 4): agregacao "aba TRANSFERENCIAS" por caixa+dia (1a/2a/3a, TOTAL SAIDA/ENTRADA, SALDO).
  app.get(
    "/api/caixa/:caixaId/transferencias",
    { preHandler: exigirAlgumaPermissao(["caixa_operar", "caixas_gerenciar"]) },
    async (request, reply) => {
      const { caixaId } = caixaParamsSchema.parse(request.params);
      try {
        return ok(await obterTransferenciasCaixa(caixaId, request.perfilUsuario!));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErro(mensagem), mensagem);
      }
    }
  );

  // Paginacao e filtros sao do banco (nao mais paginadoDeArray sobre a empresa inteira); os totais
  // do rodape acompanham o FILTRO, nao a pagina, e viajam no meta ao lado da paginacao.
  app.get("/api/caixa/historico", { preHandler: exigirPermissao("caixas_gerenciar") }, async (request, reply) => {
    const query = historicoCaixaQuerySchema.parse(request.query);
    try {
      const { itens, total, page, pageSize, totais } = await listarHistoricoCaixa(query, request.perfilUsuario!);
      const resposta = paginadoDeResultado({ itens, total, page, pageSize });
      return { ...resposta, meta: { ...resposta.meta, totais } };
    } catch (error) {
      const mensagem = mensagemDominioOuRelancar(error);
      return erro(reply, statusErro(mensagem), mensagem);
    }
  });

  // Detalhe de auditoria de um caixa: alteracoes de horario e acerto de saldo.
  app.get(
    "/api/caixa/:caixaId/detalhe",
    { preHandler: exigirPermissao("caixas_gerenciar") },
    async (request, reply) => {
      const params = caixaParamsSchema.parse(request.params);
      try {
        return ok(await obterDetalheCaixa(params.caixaId, request.perfilUsuario!));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErro(mensagem), mensagem);
      }
    }
  );
}
