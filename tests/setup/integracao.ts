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

// Alguns testes de caixa montam um estado contabil ja recebido, mas nao testam a autorizacao da
// confirmacao (essa vertical tem teste proprio). Mantem a fixture coerente com os CHECKs e rompe o
// lacre junto, sem repetir em cada arquivo o SQL de transicao.
export async function confirmarTransferenciaPorLacreDireto(numeroLacre: string, usuarioId: string) {
  const pool = poolTeste();
  try {
    await pool.query(
      `update transferencias
          set status = 'recebido', confirmado_por = $2, data_recebimento = now(), atualizado_em = now()
        where n_lacre_doc = $1`,
      [numeroLacre, usuarioId]
    );
    await pool.query("update lacres set rompido = true where numero = $1", [numeroLacre]);
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
