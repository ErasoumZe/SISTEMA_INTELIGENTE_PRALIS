import type { FastifyInstance } from "fastify";
import { ok } from "@padaria/shared/api";
import { obterSaude } from "./saude.service.js";

export async function registrarRotasSaude(app: FastifyInstance) {
  app.get("/health", async () => ok(await obterSaude()));
}

