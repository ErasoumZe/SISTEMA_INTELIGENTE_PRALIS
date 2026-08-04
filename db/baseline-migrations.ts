/**
 * BASELINE do controle de migrations (PROJECT_BRAIN/18 D-01, passo 1).
 *
 * O problema: o banco de DESENVOLVIMENTO nunca foi um banco "migrado". Ele e sincronizado por
 * `drizzle-kit push`, que compara o schema TypeScript com o banco e aplica a diferenca direto —
 * sem nunca escrever em `drizzle.__drizzle_migrations`. Com a tabela de controle VAZIA,
 * `npm run db:migrate` tenta aplicar da 0000 em diante, bate em objeto que ja existe e falha.
 * Nao e bug da migration: e o dev nunca ter passado pelo caminho de migration.
 *
 * O que este script faz: REGISTRA as migrations que o banco ja reflete, SEM reexecutar nenhuma.
 * A partir dai o `migrate` continua da proxima e o dev passa a rodar migration como a producao roda.
 *
 * Como o drizzle decide o que aplicar (pg-core/dialect.js): ele compara SO o `created_at` —
 * `if (!ultima || Number(ultima.created_at) < migration.folderMillis)`. O hash e gravado mas nao
 * entra na decisao. Ainda assim gravamos o hash correto (sha256 do arquivo cru, igual ao
 * `readMigrationFiles`), para a tabela ser um registro honesto do que foi aplicado.
 *
 * SEGURANCA — o script se recusa a rodar se:
 *   - a tabela de controle NAO estiver vazia (baseline duas vezes corromperia o historico);
 *   - o schema NAO parecer migrado (marcadores da ultima migration ausentes). Marcar como aplicada
 *     uma migration que nao esta no banco e pior do que nao ter baseline nenhum: o `migrate` pularia
 *     ela para sempre e o objeto nunca existiria.
 *
 * Uso:
 *   npm run db:baseline --workspace @padaria/db              # confere e mostra o que faria
 *   npm run db:baseline --workspace @padaria/db -- --apply   # grava
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const APLICAR = process.argv.includes("--apply");
const PASTA = path.join(import.meta.dirname, "migrations");

type EntradaDoJournal = { idx: number; when: number; tag: string };

const journal = JSON.parse(readFileSync(path.join(PASTA, "meta", "_journal.json"), "utf8")) as {
  entries: EntradaDoJournal[];
};

// Mesmo calculo do readMigrationFiles do drizzle: sha256 do conteudo CRU do .sql.
const migrations = journal.entries.map((entrada) => ({
  tag: entrada.tag,
  quando: entrada.when,
  hash: createHash("sha256")
    .update(readFileSync(path.join(PASTA, `${entrada.tag}.sql`)))
    .digest("hex")
}));

const databaseUrl = process.env["DATABASE_URL"]?.trim();
if (!databaseUrl) throw new Error("[baseline] DATABASE_URL obrigatoria");

const pool = new pg.Pool({ connectionString: databaseUrl });

// Marcadores da ULTIMA migration do journal. Se o banco nao os tem, ele nao esta no ponto que o
// baseline vai declarar — e a coisa certa e rodar o migrate de verdade, nao mentir na tabela.
const MARCADORES = [
  {
    o_que: "tabela lancamentos_recorrencias (0019)",
    sql: "select to_regclass('public.lancamentos_recorrencias') is not null as ok"
  },
  {
    o_que: "coluna despesas.recorrencia_id (0019)",
    sql: "select exists(select 1 from information_schema.columns where table_name='despesas' and column_name='recorrencia_id') as ok"
  },
  {
    o_que: "coluna contas.saldo_inicial (0018)",
    sql: "select exists(select 1 from information_schema.columns where table_name='contas' and column_name='saldo_inicial') as ok"
  },
  { o_que: "tabela grupos_patrimonio (0016)", sql: "select to_regclass('public.grupos_patrimonio') is not null as ok" }
];

try {
  console.info(`[baseline] ${migrations.length} migrations no journal (0000..${migrations.at(-1)?.tag})`);
  console.info(`[baseline] modo: ${APLICAR ? "APLICAR" : "CONFERENCIA (nao grava)"}\n`);

  await pool.query("CREATE SCHEMA IF NOT EXISTS drizzle");
  await pool.query(
    "CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)"
  );

  const { rows: jaRegistradas } = await pool.query<{ total: string }>(
    "select count(*)::text as total from drizzle.__drizzle_migrations"
  );
  const total = Number(jaRegistradas[0]?.total ?? "0");
  if (total > 0) {
    console.error(
      `[baseline] RECUSADO: a tabela de controle ja tem ${total} linha(s). Este script e so para o\n` +
        "           banco que nunca passou por migration. Rode 'npm run db:migrate' normalmente."
    );
    process.exit(1);
  }

  console.info("[baseline] conferindo se o schema realmente esta no ponto do journal:");
  let faltando = 0;
  for (const marcador of MARCADORES) {
    const { rows } = await pool.query<{ ok: boolean }>(marcador.sql);
    const ok = rows[0]?.ok === true;
    if (!ok) faltando += 1;
    console.info(`  ${ok ? "OK  " : "FALTA"} ${marcador.o_que}`);
  }
  if (faltando > 0) {
    console.error(
      `\n[baseline] RECUSADO: ${faltando} marcador(es) ausente(s). O banco NAO esta no ponto que o\n` +
        "           baseline declararia. Marcar como aplicada uma migration que nao esta no banco faz\n" +
        "           o migrate pular ela para sempre. Sincronize o schema antes (db:push) ou migre."
    );
    process.exit(1);
  }

  if (!APLICAR) {
    console.info("\n[baseline] registraria estas entradas (nenhuma SQL de migration seria executada):");
    for (const migration of migrations) console.info(`  ${migration.tag.padEnd(34)} created_at=${migration.quando}`);
    console.info("\n[baseline] conferencia OK. Para gravar: npm run db:baseline --workspace @padaria/db -- --apply");
    process.exit(0);
  }

  const cliente = await pool.connect();
  try {
    await cliente.query("BEGIN");
    for (const migration of migrations) {
      await cliente.query('insert into drizzle.__drizzle_migrations ("hash", "created_at") values ($1, $2)', [
        migration.hash,
        migration.quando
      ]);
    }
    await cliente.query("COMMIT");
  } catch (erro) {
    await cliente.query("ROLLBACK");
    throw erro;
  } finally {
    cliente.release();
  }

  const { rows: conferencia } = await pool.query<{ total: string; ultima: string }>(
    "select count(*)::text as total, max(created_at)::text as ultima from drizzle.__drizzle_migrations"
  );
  console.info(
    `\n[baseline] ${conferencia[0]?.total} migrations registradas. created_at mais alto: ${conferencia[0]?.ultima}` +
      `\n[baseline] o proximo 'db:migrate' aplica so o que vier DEPOIS de ${migrations.at(-1)?.tag}.`
  );
} finally {
  await pool.end();
}
