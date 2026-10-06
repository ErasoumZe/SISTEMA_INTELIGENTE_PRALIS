import { mensagemDominioOuRelancar } from "../erros.js";
import type { FastifyInstance } from "fastify";
import { createReadStream } from "node:fs";
import { z } from "zod";
import {
  abrirCaixaPayloadSchema,
  cancelarPlanejamentoRetornoPayloadSchema,
  caixaParamsSchema,
  caixaStatusQuerySchema,
  planejamentoRetornoIdParamsSchema,
  planejamentoRetornoParamsSchema,
  fecharCaixaPayloadSchema,
  gerarRelatorioVendasFechamentoSchema,
  iniciarFechamentoCaixaPayloadSchema,
  registrarIndisponibilidadeCaixaPayloadSchema,
  historicoCaixaQuerySchema,
  salvarRelatorioMaquininhaFechamentoSchema,
  transferenciaCofrePayloadSchema,
  vendasDoCaixaQuerySchema
} from "@padaria/shared/caixa";
import { exigirAlgumaPermissao, exigirPermissao } from "../auth/guards.js";
import { criadoId, erro, ok, paginadoDeResultado, semConteudo } from "@padaria/shared/api";
import {
  abrirCaixa,
  criarTransferenciaCofreCaixa,
  cancelarPlanejamentoRetorno,
  consultarMaloteParaAbertura,
  listarLacresRetornoDisponiveisCaixa,
  executarPlanejamentoRetorno,
  fecharCaixa,
  iniciarFechamentoCaixa,
  listarHistoricoCaixa,
  listarVendasCanceladasCaixa,
  listarVendasDoCaixaAberto,
  obterRelatorioVendasFechamento,
  gerarRelatorioVendasFechamento,
  listarPlanejamentosRetorno,
  obterDetalheCaixa,
  obterStatusCaixa,
  obterArquivoAnexoFechamentoCaixa,
  obterTransferenciasCaixa,
  listarAnexosFechamentoCaixa,
  listarConferenciasFisicasCaixa,
  removerAnexoFechamentoCaixa,
  salvarAnexoFechamentoCaixa,
  analisarRelatorioMaquininhaFechamento,
  obterRelatorioMaquininhaFechamento,
  salvarRelatorioMaquininhaFechamento,
  transcreverObservacaoFechamento,
  registrarIndisponibilidadeCaixa,
  registrarRetornoIndisponibilidadeCaixa
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

  app.post(
    "/api/caixa/transcricao-observacao",
    {
      preHandler: exigirPermissao("caixa_operar"),
      config: { rateLimit: { max: 12, timeWindow: "1 minute" } }
    },
    async (request, reply) => {
      try {
        const arquivo = await request.file({ limits: { fileSize: 3 * 1024 * 1024, files: 1 } });
        return ok(await transcreverObservacaoFechamento(arquivo));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErro(mensagem), mensagem);
      }
    }
  );

  app.get("/api/caixa/malote", { preHandler: exigirPermissao("caixa_operar") }, async (request, reply) => {
    const query = z
      .object({ empresaId: z.string().uuid(), pdvId: z.string().uuid(), lacre: z.string().trim().min(1) })
      .parse(request.query);
    try {
      return ok(await consultarMaloteParaAbertura(query.empresaId, query.pdvId, query.lacre, request.perfilUsuario!));
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

  app.post(
    "/api/caixa/:caixaId/iniciar-fechamento",
    { preHandler: exigirPermissao("caixa_operar") },
    async (request, reply) => {
      const { caixaId } = caixaParamsSchema.parse(request.params);
      iniciarFechamentoCaixaPayloadSchema.parse(request.body);
      try {
        return ok(await iniciarFechamentoCaixa(caixaId, request.perfilUsuario!));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErro(mensagem), mensagem);
      }
    }
  );

  app.post(
    "/api/caixa/:caixaId/indisponibilidades",
    { preHandler: exigirPermissao("caixa_operar") },
    async (request, reply) => {
      const { caixaId } = caixaParamsSchema.parse(request.params);
      const body = registrarIndisponibilidadeCaixaPayloadSchema.parse(request.body);
      try {
        return ok(await registrarIndisponibilidadeCaixa(caixaId, body, request.perfilUsuario!));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErro(mensagem), mensagem);
      }
    }
  );

  app.post(
    "/api/caixa/:caixaId/indisponibilidades/retornar",
    { preHandler: exigirPermissao("caixa_operar") },
    async (request, reply) => {
      const { caixaId } = caixaParamsSchema.parse(request.params);
      try {
        return ok(await registrarRetornoIndisponibilidadeCaixa(caixaId, request.perfilUsuario!));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErro(mensagem), mensagem);
      }
    }
  );

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
    "/api/caixa/:caixaId/lacres-retorno",
    { preHandler: exigirPermissao("caixa_operar") },
    async (request, reply) => {
      const { caixaId } = caixaParamsSchema.parse(request.params);
      try {
        return ok(await listarLacresRetornoDisponiveisCaixa(caixaId, request.perfilUsuario!));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErro(mensagem), mensagem);
      }
    }
  );

  app.get(
    "/api/caixa/:caixaId/anexos",
    { preHandler: exigirAlgumaPermissao(["caixa_operar", "caixas_gerenciar"]) },
    async (request, reply) => {
      const { caixaId } = caixaParamsSchema.parse(request.params);
      try {
        return ok(await listarAnexosFechamentoCaixa(caixaId, request.perfilUsuario!));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErro(mensagem), mensagem);
      }
    }
  );

  app.delete(
    "/api/caixa/:caixaId/anexos/:anexoId",
    { preHandler: exigirPermissao("caixa_operar") },
    async (request, reply) => {
      const { caixaId } = caixaParamsSchema.parse(request.params);
      const anexoId = z
        .string()
        .uuid()
        .parse((request.params as { anexoId?: string }).anexoId);
      try {
        await removerAnexoFechamentoCaixa(caixaId, anexoId, request.perfilUsuario!);
        return semConteudo(reply);
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErro(mensagem), mensagem);
      }
    }
  );

  app.get(
    "/api/caixa/:caixaId/conferencias-fisicas",
    { preHandler: exigirAlgumaPermissao(["caixa_operar", "caixas_gerenciar"]) },
    async (request, reply) => {
      const { caixaId } = caixaParamsSchema.parse(request.params);
      try {
        return ok(await listarConferenciasFisicasCaixa(caixaId, request.perfilUsuario!));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErro(mensagem), mensagem);
      }
    }
  );

  app.get(
    "/api/caixa/:caixaId/anexos/:anexoId",
    { preHandler: exigirAlgumaPermissao(["caixa_operar", "caixas_gerenciar"]) },
    async (request, reply) => {
      const { caixaId } = caixaParamsSchema.parse(request.params);
      const anexoId = z
        .string()
        .uuid()
        .parse((request.params as { anexoId?: string }).anexoId);
      try {
        const anexo = await obterArquivoAnexoFechamentoCaixa(caixaId, anexoId, request.perfilUsuario!);
        reply.header("Content-Type", anexo.mimeType);
        const nomeSeguro = anexo.nomeOriginal.replace(/[^\w. -]/gu, "_");
        reply.header("Content-Disposition", `inline; filename="${nomeSeguro || "anexo"}"`);
        reply.header("Cache-Control", "private, no-store");
        return reply.send(createReadStream(anexo.caminhoAbsoluto));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErro(mensagem), mensagem);
      }
    }
  );

  app.post("/api/caixa/:caixaId/anexos", { preHandler: exigirPermissao("caixa_operar") }, async (request, reply) => {
    const { caixaId } = caixaParamsSchema.parse(request.params);
    try {
      const arquivo = await request.file({ limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
      const campoTipo = arquivo?.fields["tipo"];
      const valorTipo = campoTipo && !Array.isArray(campoTipo) && "value" in campoTipo ? campoTipo.value : undefined;
      const tipo = z.enum(["folha_fechamento", "comprovante_cartao", "relatorio_vendas_creare"]).parse(valorTipo);
      return reply
        .status(201)
        .send(ok(await salvarAnexoFechamentoCaixa(caixaId, tipo, arquivo, request.perfilUsuario!)));
    } catch (error) {
      const mensagem = mensagemDominioOuRelancar(error);
      return erro(reply, statusErro(mensagem), mensagem);
    }
  });

  app.get(
    "/api/caixa/:caixaId/relatorio-maquininha",
    { preHandler: exigirPermissao("caixa_operar") },
    async (request, reply) => {
      const { caixaId } = caixaParamsSchema.parse(request.params);
      try {
        return ok(await obterRelatorioMaquininhaFechamento(caixaId, request.perfilUsuario!));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErro(mensagem), mensagem);
      }
    }
  );

  app.post(
    "/api/caixa/:caixaId/relatorio-maquininha/analisar",
    { preHandler: exigirPermissao("caixa_operar") },
    async (request, reply) => {
      const { caixaId } = caixaParamsSchema.parse(request.params);
      const { anexoId } = z.object({ anexoId: z.string().uuid() }).parse(request.body);
      try {
        return ok(await analisarRelatorioMaquininhaFechamento(caixaId, anexoId, request.perfilUsuario!));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErro(mensagem), mensagem);
      }
    }
  );

  app.put(
    "/api/caixa/:caixaId/relatorio-maquininha",
    { preHandler: exigirPermissao("caixa_operar") },
    async (request, reply) => {
      const { caixaId } = caixaParamsSchema.parse(request.params);
      const dados = salvarRelatorioMaquininhaFechamentoSchema.parse(request.body);
      try {
        return ok(await salvarRelatorioMaquininhaFechamento(caixaId, dados, request.perfilUsuario!));
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
    { preHandler: exigirAlgumaPermissao(["caixa_operar", "caixas_gerenciar"]) },
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

  app.get(
    "/api/caixa/:caixaId/relatorio-vendas",
    { preHandler: exigirPermissao("caixa_operar") },
    async (request, reply) => {
      const { caixaId } = caixaParamsSchema.parse(request.params);
      try {
        return ok(await obterRelatorioVendasFechamento(caixaId, request.perfilUsuario!));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErro(mensagem), mensagem);
      }
    }
  );

  app.post(
    "/api/caixa/:caixaId/relatorio-vendas",
    { preHandler: exigirPermissao("caixa_operar") },
    async (request, reply) => {
      const { caixaId } = caixaParamsSchema.parse(request.params);
      try {
        return ok(
          await gerarRelatorioVendasFechamento(
            caixaId,
            gerarRelatorioVendasFechamentoSchema.parse(request.body),
            request.perfilUsuario!
          )
        );
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErro(mensagem), mensagem);
      }
    }
  );

  app.get(
    "/api/caixa/:caixaId/vendas-canceladas",
    { preHandler: exigirAlgumaPermissao(["caixa_operar", "caixas_gerenciar"]) },
    async (request, reply) => {
      const params = caixaParamsSchema.parse(request.params);
      try {
        return ok(await listarVendasCanceladasCaixa(params.caixaId, request.perfilUsuario!));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErro(mensagem), mensagem);
      }
    }
  );

  // Consulta de conferencia do turno em curso. Nao e uma segunda rota de relatorio: o servico
  // prende empresa, PDV e caixa no servidor e entrega somente leitura para o operador titular.
  app.get(
    "/api/caixa/:caixaId/vendas",
    { preHandler: exigirAlgumaPermissao(["caixa_operar", "caixas_gerenciar"]) },
    async (request, reply) => {
      const { caixaId } = caixaParamsSchema.parse(request.params);
      const query = vendasDoCaixaQuerySchema.parse(request.query);
      try {
        const consulta = await listarVendasDoCaixaAberto(caixaId, query, request.perfilUsuario!);
        const pagina = paginadoDeResultado(consulta.resultado);
        return {
          ...pagina,
          meta: {
            ...pagina.meta,
            totais: consulta.totais,
            abertura: consulta.abertura,
            limiteSuperior: consulta.limiteSuperior,
            manuaisSemHorarioForaDoFiltro: consulta.manuaisSemHorarioForaDoFiltro
          }
        };
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErro(mensagem), mensagem);
      }
    }
  );
}
