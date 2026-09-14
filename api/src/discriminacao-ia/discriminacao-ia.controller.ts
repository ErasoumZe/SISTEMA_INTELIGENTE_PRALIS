import type { FastifyInstance } from "fastify";
import { analisarNotaFiscalIaQuerySchema } from "@padaria/shared";
import { ok } from "@padaria/shared/api";
import { analisarNotaFiscalIa } from "./discriminacao-ia.service.js";
import { lerImagemNota, TAMANHO_MAXIMO_IMAGEM_IA } from "./imagem-nota.js";

export async function registrarRotasDiscriminacaoIa(app: FastifyInstance): Promise<void> {
  app.post(
    "/api/discriminacao-ia/analisar",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request) => {
      const query = analisarNotaFiscalIaQuerySchema.parse(request.query);
      const arquivo = await request.file({ limits: { fileSize: TAMANHO_MAXIMO_IMAGEM_IA, files: 1, fields: 0 } });
      const imagem = await lerImagemNota(arquivo);
      return ok(await analisarNotaFiscalIa({ ...query, imagem }, request.perfilUsuario!));
    }
  );
}
