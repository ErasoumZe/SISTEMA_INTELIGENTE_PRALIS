import type { AplicacaoFastify } from "../tipos/fastify.js";
import { ok } from "../respostas.js";
import { obterSaude } from "./saude.service.js";

export async function registrarRotasSaude(app: AplicacaoFastify) {
  app.get("/health", async () => ok(await obterSaude()));
}
