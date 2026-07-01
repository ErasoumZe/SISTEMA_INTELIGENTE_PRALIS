import type { FastifyInstance } from "fastify";
import { aplicarSeedIntegracao } from "./seed.js";

export type ContextoApiTeste = {
  app: FastifyInstance;
  fechar: () => Promise<void>;
};

export async function criarContextoApiTeste(): Promise<ContextoApiTeste> {
  await aplicarSeedIntegracao();
  const { buildApp } = await import("../../api/src/app.js");
  const app = await buildApp();
  return {
    app,
    fechar: async () => {
      await app.close();
    }
  };
}
