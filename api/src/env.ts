import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  DATABASE_URL: z.string().url().default("postgresql://padaria:padaria@localhost:5543/padaria"),
  BETTER_AUTH_SECRET: z.string().min(32).default("dev-secret-change-me-dev-secret-change-me"),
  AUTH_BASE_URL: z.string().url().default("http://localhost:4100"),
  WEB_ORIGIN: z.string().url().default("http://localhost:5174"),
  PORT: z.coerce.number().default(4100),
  HOST: z.string().default("0.0.0.0")
});

export const env = envSchema.parse(process.env);
