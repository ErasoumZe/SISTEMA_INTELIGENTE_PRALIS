import type { FastifyInstance } from "fastify";
import { erro, ok } from "@padaria/shared/api";
import { z } from "zod";
import { exigirPermissao } from "../auth/guards.js";
import { arquivoDaRequisicao, ator, responderErro } from "./produtos-sia-depara.controller.js";
import { aplicarPesaveis, previaPesaveis } from "./produtos-pesaveis.service.js";
import {
  aplicarBackfillPesavel,
  aplicarPadronizarPesavel,
  previaBackfillPesavel,
  previaPadronizarPesavel
} from "./produtos-pesaveis-lote.service.js";

const empresa = z.object({ empresaId: z.string().uuid() });
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const conflitos = z.enum(["bloquear", "manterCadastro"]).default("bloquear");
// A tela oficial manda `naoPesavel` por padrao: a balanca nao aceita codigo acima de 999999.
const barrasProprias = z.enum(["pesavel", "naoPesavel"]).default("naoPesavel");
const queryAplicarExportacao = empresa.extend({
  confirmacao: z.string().trim().max(80).default(""),
  hashArquivo: hash,
  hashPlano: hash
});
const corpoAplicar = empresa.extend({ confirmacao: z.string().min(1).max(80), hashPlano: hash });

/**
 * Manutencao de pesaveis (oficial `/admin/creare/pesaveis`, `/pesavel-backfill`, `/pesavel-padronizar`,
 * R-222): previa sem gravar e aplicacao com frase + hash da previa. So o administrador (conferido no servico).
 */
export async function registrarRotasPesaveis(app: FastifyInstance): Promise<void> {
  const guarda = { preHandler: exigirPermissao("cadastro_produtos_editar") };

  app.post("/api/produtos/pesaveis/previa", guarda, async (request, reply) => {
    try {
      const { empresaId } = empresa.parse(request.query);
      const arquivo = await arquivoDaRequisicao(request);
      if (!arquivo) return erro(reply, 400, "Envie a exportação do SIA.", "FILE_REQUIRED");
      return ok(await previaPesaveis(empresaId, arquivo, ator(request)));
    } catch (error) {
      return responderErro(reply, error);
    }
  });

  app.post("/api/produtos/pesaveis", guarda, async (request, reply) => {
    try {
      const { empresaId, ...entrada } = queryAplicarExportacao.parse(request.query);
      const arquivo = await arquivoDaRequisicao(request);
      if (!arquivo) return erro(reply, 400, "Envie a exportação do SIA.", "FILE_REQUIRED");
      const resultado = await aplicarPesaveis(empresaId, arquivo, entrada, ator(request));
      request.log.info({ evento: "produtos.pesaveis.aplicado", usuarioId: request.usuarioId, empresaId, ...resultado });
      return ok(resultado);
    } catch (error) {
      return responderErro(reply, error);
    }
  });

  app.get("/api/produtos/pesavel-backfill/previa", guarda, async (request, reply) => {
    try {
      const query = empresa.extend({ conflitos }).parse(request.query);
      return ok(await previaBackfillPesavel(query.empresaId, ator(request), { conflitos: query.conflitos }));
    } catch (error) {
      return responderErro(reply, error);
    }
  });

  app.post("/api/produtos/pesavel-backfill", guarda, async (request, reply) => {
    try {
      const corpo = corpoAplicar.extend({ conflitos }).parse(request.body);
      const resultado = await aplicarBackfillPesavel(corpo.empresaId, corpo, ator(request), {
        conflitos: corpo.conflitos
      });
      request.log.info({ evento: "produtos.pesavel_backfill.aplicado", usuarioId: request.usuarioId, ...resultado });
      return ok(resultado);
    } catch (error) {
      return responderErro(reply, error);
    }
  });

  app.get("/api/produtos/pesavel-padronizar/previa", guarda, async (request, reply) => {
    try {
      const query = empresa.extend({ barrasProprias }).parse(request.query);
      return ok(
        await previaPadronizarPesavel(query.empresaId, ator(request), { barrasProprias: query.barrasProprias })
      );
    } catch (error) {
      return responderErro(reply, error);
    }
  });

  app.post("/api/produtos/pesavel-padronizar", guarda, async (request, reply) => {
    try {
      const corpo = corpoAplicar.extend({ barrasProprias }).parse(request.body);
      const resultado = await aplicarPadronizarPesavel(corpo.empresaId, corpo, ator(request), {
        barrasProprias: corpo.barrasProprias
      });
      request.log.info({ evento: "produtos.pesavel_padronizar.aplicado", usuarioId: request.usuarioId, ...resultado });
      return ok(resultado);
    } catch (error) {
      return responderErro(reply, error);
    }
  });
}
