import { createReadStream } from "node:fs";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { historicoCaixaQuerySchema } from "@padaria/shared/caixa";
import { erro, ok, paginadoDeResultado } from "@padaria/shared/api";
import { exigirAcessoRelatorioFechamento, exigirPermissao } from "../auth/guards.js";
import { mensagemDominioOuRelancar } from "../erros.js";
import {
  listarRelatoriosFechamento,
  obterAnexoDossieFechamento,
  obterDossieFechamento,
  registrarConferenciaTesourariaFechamento
} from "./relatorio-fechamento.service.js";

const paramsSchema = z.object({ caixaId: z.string().uuid(), anexoId: z.string().uuid().optional() });
const conferenciaTesourariaSchema = z.object({
  resultado: z.enum(["conferido", "divergente"]),
  observacao: z.string().trim().min(1).max(1000).optional().nullable()
});

function statusErro(mensagem: string) {
  if (mensagem === "Empresa nao permitida") return 403;
  if (mensagem === "Caixa nao encontrado" || mensagem === "Anexo nao encontrado") return 404;
  return 400;
}

export async function registrarRotasRelatorioFechamento(app: FastifyInstance) {
  app.get(
    "/api/relatorios/fechamentos",
    { preHandler: [exigirPermissao("relatorio_fechamento_visualizar"), exigirAcessoRelatorioFechamento()] },
    async (request, reply) => {
      const query = historicoCaixaQuerySchema.parse(request.query);
      try {
        const resultado = await listarRelatoriosFechamento(query, request.perfilUsuario!);
        return {
          ...paginadoDeResultado(resultado),
          meta: { ...paginadoDeResultado(resultado).meta, totais: resultado.totais }
        };
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErro(mensagem), mensagem);
      }
    }
  );

  app.get(
    "/api/relatorios/fechamentos/:caixaId",
    { preHandler: [exigirPermissao("relatorio_fechamento_visualizar"), exigirAcessoRelatorioFechamento()] },
    async (request, reply) => {
      const { caixaId } = paramsSchema.parse(request.params);
      try {
        return ok(await obterDossieFechamento(caixaId, request.perfilUsuario!));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErro(mensagem), mensagem);
      }
    }
  );

  app.post(
    "/api/relatorios/fechamentos/:caixaId/conferir",
    { preHandler: [exigirPermissao("fechamentos_caixa_conferir"), exigirAcessoRelatorioFechamento()] },
    async (request, reply) => {
      const { caixaId } = paramsSchema.parse(request.params);
      const dados = conferenciaTesourariaSchema.parse(request.body);
      try {
        return ok(await registrarConferenciaTesourariaFechamento(caixaId, dados, request.perfilUsuario!));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErro(mensagem), mensagem);
      }
    }
  );

  app.get(
    "/api/relatorios/fechamentos/:caixaId/anexos/:anexoId",
    { preHandler: [exigirPermissao("relatorio_fechamento_visualizar"), exigirAcessoRelatorioFechamento()] },
    async (request, reply) => {
      const { caixaId, anexoId } = paramsSchema.extend({ anexoId: z.string().uuid() }).parse(request.params);
      try {
        const anexo = await obterAnexoDossieFechamento(caixaId, anexoId, request.perfilUsuario!);
        reply.header("Content-Type", anexo.mimeType);
        reply.header(
          "Content-Disposition",
          `inline; filename="${anexo.nomeOriginal.replace(/[^\\w. -]/gu, "_") || "anexo"}"`
        );
        reply.header("Cache-Control", "private, no-store");
        return reply.send(createReadStream(anexo.caminhoAbsoluto));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErro(mensagem), mensagem);
      }
    }
  );
}
