import pg from "pg";
import { sql } from "drizzle-orm";
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
  return banco.transaction(async (tx) => {
    // P0 lancamento x fechamento: com o FOR SHARE em toda escrita do caixa, uma transacao
    // pendurada passaria a segurar o FECHAMENTO indefinidamente — antes ela so travava o proprio
    // caixa via FK. Os tetos valem POR TRANSACAO (`set_config(..., true)` = LOCAL), de proposito:
    // a revisao final derrubou a versao anterior (`options` no pool), que alcancava as migrations
    // do better-auth (DDL abortada em 10s no deploy) e morreria no startup packet de um pooler.
    // Aqui so as transacoes da API pagam o teto; quem estourar recebe 55P03 -> 503 (app.ts).
    await tx.execute(
      sql`select set_config('lock_timeout', '10s', true), set_config('idle_in_transaction_session_timeout', '60s', true)`
    );
    return callback(tx);
  });
}

export async function executarComTransacaoOpcional<T>(
  db: ExecutorBanco | undefined,
  callback: (db: ExecutorBanco) => Promise<T> | T
) {
  if (db) return Promise.resolve(callback(db));
  return executarEmTransacao((tx) => callback(tx));
}
