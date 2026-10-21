import { buildApp } from "./app.js";
import { env } from "./env.js";
import { fecharRodadasVencidas } from "./compras/compras-fechamento.service.js";
import { materializarAgendamentos } from "./compras/compras-agendamento-agendador.js";
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
  // R-221 decisao 6: a rodada de compras fecha sozinha no vencimento. Ate 60s depois, e no primeiro
  // tick do boot se a API estava parada.
  const executarAgendadorCompras = () => {
    void fecharRodadasVencidas(new Date(), (rodadaId, erro) =>
      app.log.error({ err: erro, rodadaId }, "falha ao fechar rodada de compras vencida")
    ).catch((error) => app.log.error(error));
    // Doc 56: a data de um agendamento de pedido chegou -> solicitacao para conferir + aviso no sino.
    void materializarAgendamentos(new Date(), (agendaId, erro) =>
      app.log.error({ err: erro, agendaId }, "falha ao materializar agendamento de pedido")
    ).catch((error) => app.log.error(error));
  };
  executarAgendadorCompras();
  const agendadorCompras = setInterval(executarAgendadorCompras, 60_000);
  agendadorCompras.unref();
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
