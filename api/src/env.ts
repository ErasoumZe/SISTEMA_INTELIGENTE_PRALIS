import "dotenv/config";
import { z } from "zod";

const segredoDev = "dev-secret-change-me-dev-secret-change-me";
const bancoDev = "postgresql://padaria:padaria@localhost:5543/padaria";
const segredoPlaceholderExample = "change-me-in-production-with-at-least-32-chars";

const envSchema = z.object({
  // Enum fechado: um typo (ex.: "prod") derruba o boot em vez de desativar
  // silenciosamente os gates de producao.
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url().default(bancoDev),
  BETTER_AUTH_SECRET: z.string().min(32).default(segredoDev),
  AUTH_BASE_URL: z.string().url().default("http://localhost:4100"),
  WEB_ORIGIN: z.string().url().default("http://localhost:5174"),
  PORT: z.coerce.number().default(4100),
  HOST: z.string().default("0.0.0.0"),
  // Observabilidade opcional: sem DSN, o rastreamento de erros e no-op.
  SENTRY_DSN: z.string().url().optional()
});

export const env = envSchema.parse(process.env);

// Gate de producao: os defaults acima existem para conveniencia de dev/teste.
// Subir producao com qualquer um deles seria assinar sessoes com segredo publico
// ou apontar para banco local — melhor recusar o boot com mensagem clara.
if (env.NODE_ENV === "production") {
  const problemas: string[] = [];
  if (env.BETTER_AUTH_SECRET === segredoDev || env.BETTER_AUTH_SECRET === segredoPlaceholderExample) {
    problemas.push("BETTER_AUTH_SECRET esta com o valor default de desenvolvimento");
  }
  if (env.DATABASE_URL === bancoDev) {
    problemas.push("DATABASE_URL esta apontando para o banco local de desenvolvimento");
  }
  if (problemas.length) {
    throw new Error(`Configuracao invalida para producao: ${problemas.join("; ")}`);
  }
}
