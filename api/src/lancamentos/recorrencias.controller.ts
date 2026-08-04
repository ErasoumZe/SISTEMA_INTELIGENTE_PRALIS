import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { apiIdParamsSchema, erro, ok } from "@padaria/shared/api";
import { mensagemDominioOuRelancar } from "../erros.js";
import { cancelarSerieRecorrencia } from "./recorrencias.service.js";

const cancelarSchema = z.object({
  empresaId: z.string().uuid(),
  dominio: z.enum(["despesa", "mercadoria", "retirada"])
});

export async function registrarRotasRecorrencias(app: FastifyInstance) {
  app.patch("/api/recorrencias/:id/cancelar", async (request, reply) => {
    const { id } = apiIdParamsSchema.parse(request.params);
    const dados = cancelarSchema.parse(request.body);
    try {
      return ok(await cancelarSerieRecorrencia(id, dados.dominio, dados.empresaId, request.perfilUsuario!));
    } catch (error) {
      return erro(reply, 400, mensagemDominioOuRelancar(error));
    }
  });
}
