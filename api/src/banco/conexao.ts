import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { schema, type Schema } from "@padaria/db/schema";
import { env } from "../env.js";

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL
});

const bancoBase: NodePgDatabase<Schema> = drizzle(pool, { schema });

export type Banco = typeof bancoBase;
export type TransacaoBanco = Parameters<Parameters<Banco["transaction"]>[0]>[0];
export type ExecutorBanco = Banco | TransacaoBanco;

export const banco = bancoBase;

export async function executarEmTransacao<T>(callback: (tx: TransacaoBanco) => Promise<T> | T) {
  return banco.transaction((tx) => Promise.resolve(callback(tx)));
}
