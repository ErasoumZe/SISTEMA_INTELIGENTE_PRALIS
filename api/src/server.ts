import { buildApp } from "./app.js";
import { env } from "./env.js";
import { fecharRodadasVencidas } from "./compras/compras-fechamento.service.js";
import { materializarAgendamentos } from "./compras/compras-agendamento-agendador.js";
import { materializarConferencias } from "./compras/conferencias-estoque-agendador.js";
import { processarFilaWhatsapp } from "./compras/compras-whatsapp.service.js";
import { processarTransferenciasTemporais } from "./transferencias/transferencias.service.js";
import { iniciarReenvioDaPlanilha } from "./produtos/produtos-planilha.service.js";

const app = await buildApp();

try {
  const address = await app.listen({ port: env.PORT, host: env.HOST });
  // Reenvio do espelho na planilha: so com o espelho ligado (virada) e em producao.
  iniciarReenvioDaPlanilha();
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
    // Doc 57 §1: a data de uma conferencia de estoque agendada chegou -> lista para contar + aviso no sino.
    void materializarConferencias(new Date(), (agendaId, erro) =>
      app.log.error({ err: erro, agendaId }, "falha ao materializar conferencia de estoque")
    ).catch((error) => app.log.error(error));
    // Doc 57 §3: a fila do WhatsApp (cotacoes e "pode entregar"). Sem provedor configurado, nao faz nada.
    void processarFilaWhatsapp((envioId, erro) =>
      app.log.warn({ err: erro, envioId }, "falha ao enviar mensagem do WhatsApp")
    ).catch((error) => app.log.error(error));
  };
  executarAgendadorCompras();
  const agendadorCompras = setInterval(executarAgendadorCompras, 60_000);
  agendadorCompras.unref();
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
