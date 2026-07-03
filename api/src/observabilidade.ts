// Rastreamento de erros opcional (Sentry), ativado por env. Sem `SENTRY_DSN` tudo e no-op —
// o servidor sobe normalmente em dev/teste. Em producao, definir SENTRY_DSN ativa a captura
// dos erros internos (500) que ja sao logados pelo pino. Verificacao completa do reporte exige
// um DSN real em staging.
import * as Sentry from "@sentry/node";
import { env } from "./env.js";

let ativo = false;

export function iniciarObservabilidade(): void {
  if (!env.SENTRY_DSN || ativo) return;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    // Sem tracing/perf por ora: so rastreamento de erros (o mais barato e util).
    tracesSampleRate: 0
  });
  ativo = true;
}

export function observabilidadeAtiva(): boolean {
  return ativo;
}

export function capturarErro(error: Error): void {
  if (ativo) Sentry.captureException(error);
}
