import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { consultarTodos } from "../../setup/integracao.js";
import { lerTriggersManuais } from "@padaria/db/triggers-manuais";

const raizRepositorio = fileURLToPath(new URL("../../..", import.meta.url));

// Quantidade de migrations esperadas = entradas do journal (fonte da verdade do drizzle-kit).
// Derivado do arquivo para o teste nao quebrar por numero magico a cada nova migration.
const journalMigracoes = JSON.parse(
  readFileSync(new URL("../../../db/migrations/meta/_journal.json", import.meta.url), "utf8")
) as { entries: unknown[] };
const totalMigracoesEsperado = journalMigracoes.entries.length;

// --- triggers de `atualizado_em` ----------------------------------------------------------------
//
// O conjunto esperado e DERIVADO das migrations, nao digitado. Um numero fixo aqui envelhece a cada
// tabela nova: era `21`, virou mentira quando a 0032 e a 0033 entraram, e o gate so acusou muito
// depois do commit.
//
// Duas origens, e o teste precisa cobrir as duas:
//   - a 0002 instala percorrendo um ARRAY LITERAL de nomes de tabela;
//   - toda tabela criada DEPOIS precisa do `create trigger` escrito a mao na propria migration, porque
//     a 0002 nao volta atras. Foi assim na 0032 (funcoes_operacionais, admissoes_testes) e na 0033
//     (admissoes_processos).
//
// A segunda metade vem de `lerTriggersManuais`, o MESMO modulo que o provisionamento de dev e o de
// Testcontainers usam para instalar. Se o teste tivesse a propria varredura, ele poderia passar
// concordando consigo mesmo enquanto o provisionamento instalava outra coisa.
const dirMigracoes = fileURLToPath(new URL("../../../db/migrations", import.meta.url));

function tabelasDoArrayDa0002(): string[] {
  const sql = readFileSync(join(dirMigracoes, "0002_hardening_atualizado_em.sql"), "utf8");
  const inicio = sql.indexOf("array array[");
  const fim = sql.indexOf("] loop", inicio);
  if (inicio < 0 || fim < 0) throw new Error("bloco de tabelas da 0002 nao encontrado");
  return [...sql.slice(inicio, fim).matchAll(/'([a-z_]+)'/g)].map((achado) => achado[1] ?? "");
}

// Tabelas que TEM a coluna `atualizado_em` e NAO tem o trigger. Nao e o estado desejado — e o estado
// real, declarado aqui para que a lista nao cresca em silencio: uma quinta tabela nesta situacao
// quebra o teste e obriga a decisao. Fechar as quatro exige migration propria, fora deste gate.
const semTriggerConhecidas = ["maquininhas", "notas_fiscais", "pedidos", "turnos"];

const sqlTabelasComTrigger = `
  select distinct event_object_table as tabela
  from information_schema.triggers
  where trigger_name like '%set_atualizado_em'
  order by 1
`;

const sqlTabelasComColuna = `
  select table_name as tabela
  from information_schema.columns
  where table_schema = 'public' and column_name = 'atualizado_em'
  order by 1
`;

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
    const aMao = lerTriggersManuais();

    // O nome do trigger CARREGA o nome da tabela. Nao e cosmetico: a consulta acha os triggers por
    // `like '%set_atualizado_em'`, entao um nome fora da convencao some do gate sem quebrar nada.
    for (const { arquivo, nome, tabela } of aMao) {
      expect(nome, arquivo).toBe(`${tabela}_set_atualizado_em`);
    }

    // Nomeadas de proposito, e nao so contadas: se a 0032 ou a 0033 perderem o bloco de trigger, o
    // teste diz QUAL tabela ficou sem — a 0002 nao cobre nenhuma das tres.
    expect(aMao.map((achado) => achado.tabela).sort()).toEqual([
      "admissoes_processos",
      "admissoes_testes",
      "funcoes_operacionais"
    ]);

    const esperadas = [...new Set([...tabelasDoArrayDa0002(), ...aMao.map((achado) => achado.tabela)])].sort();

    const comTriggerMigrate = (await bancoMigrado.query<{ tabela: string }>(sqlTabelasComTrigger)).rows.map(
      (linha) => linha.tabela
    );
    // Igualdade de CONJUNTO, nos dois sentidos: acusa tanto o trigger que a migration prometeu e nao
    // criou quanto o que existe no banco sem migration nenhuma pedindo.
    expect(comTriggerMigrate).toEqual(esperadas);

    // O banco global (push + aplicacao pos-push) precisa ter as mesmas triggers.
    const comTriggerPush = (await consultarTodos<{ tabela: string }>(sqlTabelasComTrigger)).map(
      (linha) => linha.tabela
    );
    expect(comTriggerPush).toEqual(esperadas);

    // A coluna sem o trigger e o defeito silencioso: `atualizado_em` fica parada e ninguem percebe.
    // A lista de excecoes conhecidas esta declarada em `semTriggerConhecidas` — a quinta quebra aqui.
    const comColuna = (await bancoMigrado.query<{ tabela: string }>(sqlTabelasComColuna)).rows.map(
      (linha) => linha.tabela
    );
    expect(comColuna.filter((tabela) => !esperadas.includes(tabela))).toEqual(semTriggerConhecidas);
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
