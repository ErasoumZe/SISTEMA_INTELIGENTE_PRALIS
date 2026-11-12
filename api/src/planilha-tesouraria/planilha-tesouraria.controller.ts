import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { envioPlanilhaPayloadSchema } from "@padaria/shared/planilha-tesouraria";
import { ok } from "@padaria/shared/api";
import { exigirPermissao } from "../auth/guards.js";
import { enviarParaPlanilha, montarPreviaPlanilha } from "./planilha-tesouraria.service.js";

const paramsSchema = z.object({ caixaId: z.string().uuid() });

// Ultima etapa da Tesouraria (Marco, 12/11/2026): previa (leitura + conferencia) e envio para a planilha. So quem
// confere o fechamento. Nao altera nada do caixa.
export async function registrarRotasPlanilhaTesouraria(app: FastifyInstance): Promise<void> {
  app.post(
    "/api/caixa/:caixaId/planilha-tesouraria/previa",
    { preHandler: exigirPermissao("fechamentos_caixa_conferir") },
    async (request) => {
      const { caixaId } = paramsSchema.parse(request.params);
      return ok(await montarPreviaPlanilha(caixaId, request.perfilUsuario!));
    }
  );

  app.post(
    "/api/caixa/:caixaId/planilha-tesouraria/enviar",
    { preHandler: exigirPermissao("fechamentos_caixa_conferir") },
    async (request) => {
      const { caixaId } = paramsSchema.parse(request.params);
      const payload = envioPlanilhaPayloadSchema.parse(request.body);
      return ok(await enviarParaPlanilha(caixaId, payload, request.perfilUsuario!));
    }
  );
}
