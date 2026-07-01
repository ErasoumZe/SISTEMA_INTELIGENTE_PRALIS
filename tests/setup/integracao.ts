import pg from "pg";
import { expect } from "vitest";

export function poolTeste() {
  return new pg.Pool({ connectionString: process.env["DATABASE_URL"] });
}

export async function consultarUm<T extends pg.QueryResultRow>(sql: string, params: unknown[] = []) {
  const pool = poolTeste();
  try {
    const { rows } = await pool.query<T>(sql, params);
    return rows[0] ?? null;
  } finally {
    await pool.end();
  }
}

export async function consultarTodos<T extends pg.QueryResultRow>(sql: string, params: unknown[] = []) {
  const pool = poolTeste();
  try {
    const { rows } = await pool.query<T>(sql, params);
    return rows;
  } finally {
    await pool.end();
  }
}

export async function executarSql(sql: string, params: unknown[] = []) {
  const pool = poolTeste();
  try {
    await pool.query(sql, params);
  } finally {
    await pool.end();
  }
}

export function json<T>(resposta: { json: () => unknown }) {
  return resposta.json() as T;
}

export function expectNaoConterJson(resposta: { json: () => unknown }, valor: string) {
  expect(JSON.stringify(resposta.json())).not.toContain(valor);
}
