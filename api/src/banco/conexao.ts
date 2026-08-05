import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { schema, type Schema } from "@padaria/db/schema";
import { env } from "../env.js";
import { capturarErro } from "../observabilidade.js";

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL
});

// Sem este listener, DERRUBAR O POSTGRES DERRUBA A API (medido em 05/08/2026, ao verificar a G-04).
// O `pg.Pool` emite `error` quando um cliente OCIOSO cai — e `error` sem ouvinte, no EventEmitter do
// Node, nao e um aviso: e `throw`. O processo morria com "Emitted 'error' event on BoundPool
// instance" e o /health nao chegava nem a responder 503, que e justamente o que a G-04 pede.
//
// Nao ha o que "tratar" aqui: o cliente quebrado ja foi descartado pelo proprio pool, e a proxima
// consulta abre outro. O ouvinte existe para o processo SOBREVIVER a queda do banco e continuar
// respondendo — 503 no /health, para o Compose marcar unhealthy e o agente CREARE parar de tentar.
pool.on("error", (erro) => {
  console.error("[banco] cliente ocioso caiu; o pool descarta e reabre na proxima consulta:", erro.message);
  capturarErro(erro instanceof Error ? erro : new Error(String(erro)));
});

const bancoBase: NodePgDatabase<Schema> = drizzle(pool, { schema });

export type Banco = typeof bancoBase;
export type TransacaoBanco = Parameters<Parameters<Banco["transaction"]>[0]>[0];
export type ExecutorBanco = Banco | TransacaoBanco;

export const banco = bancoBase;

export async function executarEmTransacao<T>(callback: (tx: TransacaoBanco) => Promise<T> | T) {
  return banco.transaction((tx) => Promise.resolve(callback(tx)));
}

export async function executarComTransacaoOpcional<T>(
  db: ExecutorBanco | undefined,
  callback: (db: ExecutorBanco) => Promise<T> | T
) {
  if (db) return Promise.resolve(callback(db));
  return executarEmTransacao((tx) => callback(tx));
}
