import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { consultarTodos, consultarUm } from "../../setup/integracao.js";
import { COMANDO_POSTGRES_SEM_DURABILIDADE, PARAMETROS_SEM_DURABILIDADE } from "../../setup/postgres-efemero.js";

const raizRepositorio = fileURLToPath(new URL("../../..", import.meta.url));

// Quantidade de migrations esperadas = entradas do journal (fonte da verdade do drizzle-kit).
// Derivado do arquivo para o teste nao quebrar por numero magico a cada nova migration.
const journalMigracoes = JSON.parse(
  readFileSync(new URL("../../../db/migrations/meta/_journal.json", import.meta.url), "utf8")
) as { entries: unknown[] };
const totalMigracoesEsperado = journalMigracoes.entries.length;

const sqlColunas = `
  select table_name, column_name, data_type, is_nullable, coalesce(column_default, '') as column_default
  from information_schema.columns
  where table_schema = 'public'
  order by table_name, column_name
`;

const sqlIndices = `
  select indexname
  from pg_indexes
  where schemaname = 'public'
  order by indexname
`;

const sqlConstraints = `
  select conrelid::regclass::text as tabela, conname
  from pg_constraint
  where connamespace = 'public'::regnamespace
  order by 1, 2
`;

function executarMigrate(databaseUrl: string) {
  return new Promise<void>((resolve, reject) => {
    const processo = spawn("npm", ["run", "db:migrate", "--workspace", "@padaria/db"], {
      cwd: raizRepositorio,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        NODE_OPTIONS: [process.env["NODE_OPTIONS"], "--conditions=development"].filter(Boolean).join(" ")
      },
      shell: process.platform === "win32",
      windowsHide: true,
      stdio: "inherit"
    });
    const timer = setTimeout(() => {
      processo.kill("SIGTERM");
      reject(new Error("drizzle-kit migrate excedeu o timeout"));
    }, 120_000);
    processo.on("error", reject);
    processo.on("exit", (codigo) => {
      clearTimeout(timer);
      if (codigo === 0) resolve();
      else reject(new Error(`drizzle-kit migrate terminou com codigo ${codigo ?? "desconhecido"}`));
    });
  });
}

function executarSeed(databaseUrl: string) {
  return new Promise<void>((resolve, reject) => {
    const processo = spawn("npm", ["run", "seed:dev", "--workspace", "@padaria/db"], {
      cwd: raizRepositorio,
      env: {
        ...process.env,
        NODE_ENV: "development",
        DATABASE_URL: databaseUrl,
        NODE_OPTIONS: [process.env["NODE_OPTIONS"], "--conditions=development"].filter(Boolean).join(" ")
      },
      shell: process.platform === "win32",
      windowsHide: true,
      stdio: "inherit"
    });
    const timer = setTimeout(() => {
      processo.kill("SIGTERM");
      reject(new Error("seed de desenvolvimento excedeu o timeout"));
    }, 180_000);
    processo.on("error", reject);
    processo.on("exit", (codigo) => {
      clearTimeout(timer);
      if (codigo === 0) resolve();
      else reject(new Error(`seed de desenvolvimento terminou com codigo ${codigo ?? "desconhecido"}`));
    });
  });
}

describe("migracoes integration", () => {
  let container: StartedPostgreSqlContainer;
  let bancoMigrado: pg.Pool;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("padaria_migracoes")
      .withUsername("padaria_migracoes")
      .withPassword("padaria_migracoes")
      // Mesmo tratamento do container da suite, da MESMA fonte: este aqui e o mais pesado do
      // repositorio (todas as migrations + seed de desenvolvimento) e pagava a mesma espera de fsync.
      .withCommand([...COMANDO_POSTGRES_SEM_DURABILIDADE])
      .withStartupTimeout(120_000)
      .start();

    await executarMigrate(container.getConnectionUri());
    await executarSeed(container.getConnectionUri());
    bancoMigrado = new pg.Pool({ connectionString: container.getConnectionUri() });
  }, 300_000);

  afterAll(async () => {
    await bancoMigrado?.end();
    await container?.stop();
  });

  // Este container e o SEGUNDO Postgres efemero do repositorio, e o mais pesado: aplica as
  // migrations todas e roda o seed de desenvolvimento. Ele paga a mesma espera de `fsync` que o
  // container da suite pagava — por isso recebe os mesmos parametros, da mesma fonte unica. Sem
  // este caso, o segundo container viraria o novo gargalo e ninguem perceberia.
  it("Deve_RodarSemDurabilidade_Quando_ContainerEhEfemero", async () => {
    // O filtro sai da MESMA constante da assercao. Com a lista literal aqui, acrescentar um quarto
    // parametro quebrava por tamanho de array — vermelho de verdade, mas apontando para o lugar
    // errado. Com `= any($1)`, os dois lados nao tem como divergir.
    const { rows } = await bancoMigrado.query<{ parametro: string; valor: string }>(
      `select name as parametro, setting as valor
         from pg_settings
        where name = any($1)
        order by name`,
      [[...PARAMETROS_SEM_DURABILIDADE]]
    );
    expect(rows).toEqual(PARAMETROS_SEM_DURABILIDADE.map((parametro) => ({ parametro, valor: "off" })));
  });

  it("Deve_AplicarTodasAsEntradasDoJournal_Quando_ProvisionarBancoVazio", async () => {
    const { rows } = await bancoMigrado.query<{ total: number }>(
      "select count(*)::int as total from drizzle.__drizzle_migrations"
    );
    expect(rows[0]?.total).toBe(totalMigracoesEsperado);
  });

  it("Deve_RodarSeedCompleto_Quando_BancoNascerDoZero", async () => {
    const { rows } = await bancoMigrado.query<{ empresas: number; despesas: number; mercadorias: number }>(
      `select
         (select count(*)::int from empresas) as empresas,
         (select count(*)::int from despesas) as despesas,
         (select count(*)::int from mercadorias) as mercadorias`
    );
    expect(rows[0]?.empresas).toBeGreaterThan(0);
    expect(rows[0]?.despesas).toBeGreaterThan(0);
    expect(rows[0]?.mercadorias).toBeGreaterThan(0);
  });

  it("Deve_GerarEstruturaIdenticaAoPush_Quando_ProvisionarViaMigrate", async () => {
    // O banco global dos testes e provisionado por drizzle-kit push (schema direto).
    // Qualquer diferenca estrutural aqui significa drift entre schema e migrations.
    const [colunasMigrate, colunasPush] = await Promise.all([
      bancoMigrado.query(sqlColunas).then((resultado) => resultado.rows),
      consultarTodos(sqlColunas)
    ]);
    expect(colunasMigrate).toEqual(colunasPush);

    const [indicesMigrate, indicesPush] = await Promise.all([
      bancoMigrado.query(sqlIndices).then((resultado) => resultado.rows),
      consultarTodos(sqlIndices)
    ]);
    expect(indicesMigrate).toEqual(indicesPush);

    const [constraintsMigrate, constraintsPush] = await Promise.all([
      bancoMigrado.query(sqlConstraints).then((resultado) => resultado.rows),
      consultarTodos(sqlConstraints)
    ]);
    expect(constraintsMigrate).toEqual(constraintsPush);
  });

  it("Deve_DisponibilizarUuidV7_Quando_ProvisionarViaMigrate", async () => {
    const { rows } = await bancoMigrado.query<{ id: string }>("select uuid_generate_v7()::text as id");
    const id = rows[0]?.id ?? "";
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("Deve_CriarTriggersDeAtualizadoEm_Quando_ProvisionarViaMigrate", async () => {
    const { rows } = await bancoMigrado.query<{ total: number }>(
      `select count(distinct event_object_table)::int as total
       from information_schema.triggers
       where trigger_name like '%set_atualizado_em'`
    );
    expect(rows[0]?.total).toBe(21);

    // O banco global (push + aplicacao pos-push) precisa ter as mesmas triggers.
    const triggersPush = await consultarUm<{ total: number }>(
      `select count(distinct event_object_table)::int as total
       from information_schema.triggers
       where trigger_name like '%set_atualizado_em'`
    );
    expect(triggersPush?.total).toBe(21);
  });

  it("Deve_AtualizarAtualizadoEm_Quando_EditarRegistro", async () => {
    const empresa = await bancoMigrado.query<{ id: string }>(
      "insert into empresas (nome) values ('Empresa Migracoes') returning id"
    );
    const empresaId = empresa.rows[0]?.id;
    const cargo = await bancoMigrado.query<{ id: string; atualizado_em: Date }>(
      "insert into cargos (empresa_id, nome) values ($1, 'Cargo Migracoes') returning id, atualizado_em",
      [empresaId]
    );
    const cargoId = cargo.rows[0]?.id;
    const antes = cargo.rows[0]?.atualizado_em;

    await bancoMigrado.query("select pg_sleep(0.05)");
    const atualizado = await bancoMigrado.query<{ atualizado_em: Date }>(
      "update cargos set nome = 'Cargo Migracoes Editado' where id = $1 returning atualizado_em",
      [cargoId]
    );
    const depois = atualizado.rows[0]?.atualizado_em;

    expect(antes).toBeInstanceOf(Date);
    expect(depois).toBeInstanceOf(Date);
    expect((depois as Date).getTime()).toBeGreaterThan((antes as Date).getTime());
  });
});
