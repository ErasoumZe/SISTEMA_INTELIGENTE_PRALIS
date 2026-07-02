import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { TestProject } from "vitest/node";

const migracaoTriggersUrl = new URL("../../db/migrations/0002_hardening_atualizado_em.sql", import.meta.url);

function executar(comando: string, args: string[], env: NodeJS.ProcessEnv) {
  return new Promise<void>((resolve, reject) => {
    const processo = spawn(comando, args, {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      shell: process.platform === "win32",
      windowsHide: true,
      stdio: "inherit"
    });
    const timer = setTimeout(() => {
      processo.kill("SIGTERM");
      reject(new Error(`${comando} ${args.join(" ")} excedeu o timeout de setup`));
    }, 120_000);
    processo.on("error", reject);
    processo.on("exit", (codigo) => {
      clearTimeout(timer);
      if (codigo === 0) resolve();
      else reject(new Error(`${comando} ${args.join(" ")} terminou com codigo ${codigo ?? "desconhecido"}`));
    });
  });
}

async function aplicarTriggersAtualizadoEm(databaseUrl: string) {
  const sql = await readFile(migracaoTriggersUrl, "utf8");
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

async function prepararUuidV7(databaseUrl: string) {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(`
      create extension if not exists pgcrypto;
      create or replace function uuid_generate_v7()
      returns uuid
      language plpgsql
      volatile
      as $$
      declare
        unix_ts_ms bigint;
        bytes bytea;
      begin
        unix_ts_ms := floor(extract(epoch from clock_timestamp()) * 1000);
        bytes := gen_random_bytes(16);

        bytes := set_byte(bytes, 0, ((unix_ts_ms >> 40) & 255)::int);
        bytes := set_byte(bytes, 1, ((unix_ts_ms >> 32) & 255)::int);
        bytes := set_byte(bytes, 2, ((unix_ts_ms >> 24) & 255)::int);
        bytes := set_byte(bytes, 3, ((unix_ts_ms >> 16) & 255)::int);
        bytes := set_byte(bytes, 4, ((unix_ts_ms >> 8) & 255)::int);
        bytes := set_byte(bytes, 5, (unix_ts_ms & 255)::int);
        bytes := set_byte(bytes, 6, (get_byte(bytes, 6) & 15) | 112);
        bytes := set_byte(bytes, 8, (get_byte(bytes, 8) & 63) | 128);

        return encode(bytes, 'hex')::uuid;
      end;
      $$;
    `);
  } finally {
    await client.end();
  }
}

export async function setup(project: TestProject) {
  console.info("[tests:integration] iniciando Postgres Testcontainers");
  const postgres = await new PostgreSqlContainer("postgres:16-alpine")
    .withDatabase("padaria_test")
    .withUsername("padaria_test")
    .withPassword("padaria_test")
    .withStartupTimeout(120_000)
    .start();

  const databaseUrl = postgres.getConnectionUri();
  console.info("[tests:integration] preparando funcao uuid_generate_v7");
  await prepararUuidV7(databaseUrl);

  console.info("[tests:integration] aplicando schema Drizzle via db:push:force");
  await executar("npm", ["run", "db:push:force", "--workspace", "@padaria/db"], {
    NODE_ENV: "test",
    DATABASE_URL: databaseUrl,
    DRIZZLE_DEV_SETUP: "1",
    NODE_OPTIONS: [process.env["NODE_OPTIONS"], "--conditions=development"].filter(Boolean).join(" ")
  });

  console.info("[tests:integration] aplicando triggers de atualizado_em (paridade com migrations)");
  await aplicarTriggersAtualizadoEm(databaseUrl);

  project.provide("databaseUrl", databaseUrl);

  return async () => {
    await postgres.stop();
  };
}
