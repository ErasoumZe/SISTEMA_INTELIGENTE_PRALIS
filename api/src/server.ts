import { buildApp } from "./app.js";
import { env } from "./env.js";
import { processarTransferenciasTemporais } from "./transferencias/transferencias.service.js";

const app = await buildApp();

try {
  const address = await app.listen({ port: env.PORT, host: env.HOST });
  console.info("[api] OK API Padaria v2 pronta");
  console.info(`[api] Host: ${env.HOST}`);
  console.info(`[api] Porta: ${env.PORT}`);
  console.info(`[api] URL: http://localhost:${env.PORT}`);
  console.info(`[api] Healthcheck: http://localhost:${env.PORT}/health`);
  console.info(`[api] Auth base: ${env.AUTH_BASE_URL}`);
  console.info(`[api] Web origin/CORS: ${env.WEB_ORIGIN}`);
  console.info(`[api] Listen address: ${address}`);
  const executarAgendadorTransferencias = () => {
    void processarTransferenciasTemporais().catch((error) => app.log.error(error));
  };
  executarAgendadorTransferencias();
  const agendadorTransferencias = setInterval(executarAgendadorTransferencias, 60_000);
  agendadorTransferencias.unref();
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
