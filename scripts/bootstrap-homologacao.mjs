import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { readMigrationFiles } from "drizzle-orm/migrator";

const { Pool } = pg;
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsFolder = path.join(rootDir, "db", "migrations");
const migrationConfig = {
  migrationsFolder,
  migrationsSchema: "drizzle",
  migrationsTable: "__drizzle_migrations"
};

const expected = {
  hostnames: new Set(["localhost", "127.0.0.1", "::1"]),
  port: "5544",
  database: "padaria_homologacao",
  constraintMigration: 1792777061307
};

function fail(message) {
  throw new Error(`[bootstrap-homologacao] ${message}`);
}

function connectionInfo(databaseUrl) {
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    fail("DATABASE_URL invalida");
  }

  const hostname = parsed.hostname === "[::1]" ? "::1" : parsed.hostname;
  const port = parsed.port || "5432";
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));

  const disposable = process.env.PRALIS_HOMOLOGACAO_DISPOSABLE === "SIM";
  if (process.env.NODE_ENV === "production") fail("recusado em NODE_ENV=production");
  if (!expected.hostnames.has(hostname)) fail("host fora da lista local permitida");
  if (disposable) {
    if (port === "5543" || port === expected.port)
      fail("teste descartavel nao pode usar a porta principal ou a porta 5544");
    if (!/^padaria_homologacao_teste_[a-z0-9_-]+$/u.test(database)) {
      fail("banco descartavel deve usar o prefixo padaria_homologacao_teste_");
    }
  } else {
    if (port !== expected.port) fail("porta diferente de 5544");
    if (database !== expected.database) fail("banco diferente de padaria_homologacao");
  }
  if (process.env.PRALIS_HOMOLOGACAO_BOOTSTRAP_CONFIRMADO !== "SIM") {
    fail("exige PRALIS_HOMOLOGACAO_BOOTSTRAP_CONFIRMADO=SIM");
  }

  return { hostname, port, database, disposable };
}

async function readState(pool) {
  const relation = await pool.query(`
    SELECT to_regclass('drizzle.__drizzle_migrations') AS migration_table;
  `);
  if (!relation.rows[0].migration_table) {
    return {
      migration_table: null,
      migration_count: 0,
      last_created_at: null,
      public_table_count: 0,
      created_ats: []
    };
  }

  const result = await pool.query(`
    SELECT
      to_regclass('drizzle.__drizzle_migrations') AS migration_table,
      COALESCE((SELECT count(*) FROM drizzle.__drizzle_migrations), 0)::int AS migration_count,
      (SELECT created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1) AS last_created_at,
      (SELECT count(*) FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p'))::int AS public_table_count;
  `);
  const history = await pool.query(`
    SELECT created_at::text AS created_at
    FROM drizzle.__drizzle_migrations
    ORDER BY created_at ASC;
  `);
  return { ...result.rows[0], created_ats: history.rows.map((row) => row.created_at) };
}

function historyMatchesJournal(state, migrations) {
  if (state.created_ats.length !== state.migration_count) return false;
  if (state.migration_count > migrations.length) return false;
  return state.created_ats.every((createdAt, index) => createdAt === String(migrations[index]?.folderMillis ?? ""));
}

async function ensurePrecondition(pool) {
  await pool.query("BEGIN");
  try {
    const table = await pool.query("SELECT to_regclass('public.admissoes_processos_dependentes') AS relation;");
    if (!table.rows[0].relation) fail("a tabela de dependentes ainda nao existe antes da 0070");

    const result = await pool.query(`
      SELECT
        c.contype,
        c.conkey = ARRAY[
          (SELECT attnum FROM pg_attribute WHERE attrelid = c.conrelid AND attname = 'id'),
          (SELECT attnum FROM pg_attribute WHERE attrelid = c.conrelid AND attname = 'processo_id'),
          (SELECT attnum FROM pg_attribute WHERE attrelid = c.conrelid AND attname = 'empresa_id')
        ]::smallint[] AS definition_matches
      FROM pg_constraint c
      WHERE c.conrelid = 'public.admissoes_processos_dependentes'::regclass
        AND c.conname = 'admissoes_processos_dependentes_id_processo_empresa_unico';
    `);

    if (result.rowCount === 0) {
      await pool.query(`
        ALTER TABLE public.admissoes_processos_dependentes
        ADD CONSTRAINT admissoes_processos_dependentes_id_processo_empresa_unico
        UNIQUE (id, processo_id, empresa_id);
      `);
    } else if (result.rows[0].contype !== "u" || !result.rows[0].definition_matches) {
      fail("a constraint existente tem definição incompatível");
    }

    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) fail("DATABASE_URL obrigatoria");
  const info = connectionInfo(databaseUrl);
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  const db = drizzle(pool);

  try {
    const migrations = readMigrationFiles(migrationConfig);
    const constraintMigration = migrations.find((migration) => migration.folderMillis === expected.constraintMigration);
    if (!constraintMigration) fail("migration 0070 nao encontrada no journal");
    if (migrations.length === 0) fail("nenhuma migration encontrada no journal");

    const finalMigration = migrations[migrations.length - 1];
    if (!finalMigration) fail("nenhuma migration encontrada no journal");
    const beforeConstraint = migrations.filter((migration) => migration.folderMillis < expected.constraintMigration);
    const afterConstraint = migrations.filter((migration) => migration.folderMillis >= expected.constraintMigration);

    const state = await readState(pool);
    const lastCreatedAt = state.last_created_at === null ? null : Number(state.last_created_at);
    if (!historyMatchesJournal(state, migrations)) {
      fail("o historico do Drizzle nao corresponde a um prefixo exato do journal local");
    }

    if (lastCreatedAt !== null && lastCreatedAt === finalMigration.folderMillis) {
      if (state.migration_count !== migrations.length) fail("o ultimo timestamp nao corresponde a todas as migrations");
      console.log(`estado=ja_inicializado|banco=${info.database}|migrations=${state.migration_count}`);
      return;
    }

    const fresh = state.migration_count === 0 && state.public_table_count === 0;
    if (!fresh && state.public_table_count === 0) {
      fail("banco possui historico, mas nenhuma tabela publica para retomada segura");
    }
    if (lastCreatedAt !== null && lastCreatedAt >= finalMigration.folderMillis) {
      fail("o historico informa uma migration posterior ao journal local");
    }

    if (beforeConstraint.length === 0 || afterConstraint.length === 0) fail("particionamento do journal invalido");

    if (fresh) {
      await db.dialect.migrate(beforeConstraint, db.session, migrationConfig);
      await ensurePrecondition(pool);
    } else if (lastCreatedAt === null || lastCreatedAt < expected.constraintMigration) {
      await ensurePrecondition(pool);
    }
    await db.dialect.migrate(migrations, db.session, migrationConfig);

    const finalState = await readState(pool);
    if (
      Number(finalState.last_created_at) !== finalMigration.folderMillis ||
      finalState.migration_count !== migrations.length ||
      !historyMatchesJournal(finalState, migrations)
    ) {
      fail(`a sequencia nao terminou na ultima migration do journal (${finalMigration.folderMillis})`);
    }
    console.log(`estado=concluido|banco=${info.database}|migrations=${finalState.migration_count}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`[bootstrap-homologacao] falhou: ${error instanceof Error ? error.message : "erro desconhecido"}`);
  process.exitCode = 1;
});
