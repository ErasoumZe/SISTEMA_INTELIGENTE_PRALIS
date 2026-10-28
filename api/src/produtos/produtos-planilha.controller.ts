import type { FastifyInstance } from "fastify";
import { erro, ok } from "@padaria/shared/api";
import { z } from "zod";
import { reprocessarFilaDaPlanilha, situacaoDaFilaDaPlanilha } from "./produtos-planilha.service.js";

const corpoReenvio = z.object({
  limite: z.coerce.number().int().min(1).max(200).default(50),
  incluirDesistidos: z.boolean().default(false)
});

/**
 * Fila do espelho na planilha (oficial `/admin/produtos/reenvio`): situacao e reenvio manual, so
 * administrador. Com o espelho desligado (ate a virada), o reenvio responde `ligado: false` sem fazer nada.
 */
export async function registrarRotasPlanilhaProdutos(app: FastifyInstance): Promise<void> {
  app.get("/api/produtos/planilha/fila", async (request, reply) => {
    if (request.perfilUsuario?.role !== "usuario_admin") {
      return erro(reply, 403, "Somente administradores consultam a fila da planilha.", "INSUFFICIENT_PERMISSION");
    }
    return ok(await situacaoDaFilaDaPlanilha());
  });

  app.post("/api/produtos/planilha/reenvio", async (request, reply) => {
    if (request.perfilUsuario?.role !== "usuario_admin") {
      return erro(reply, 403, "Somente administradores reenviam para a planilha.", "INSUFFICIENT_PERMISSION");
    }
    const { limite, incluirDesistidos } = corpoReenvio.parse(request.body ?? {});
    const resultado = await reprocessarFilaDaPlanilha(limite, { incluirDesistidos });
    request.log.info({ evento: "produtos.planilha.reenvio", usuarioId: request.usuarioId, ...resultado });
    return ok(resultado);
  });
}
