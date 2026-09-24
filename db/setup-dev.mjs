import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { Client } from "pg";

import { aplicarTriggersManuais } from "./triggers-manuais.ts";

const migracaoTriggersUrl = new URL("./migrations/0002_hardening_atualizado_em.sql", import.meta.url);

const isWindows = process.platform === "win32";
const databaseUrl = process.env.DATABASE_URL ?? "postgresql://padaria:padaria@localhost:5543/padaria";

function executar(comando, args) {
  return new Promise((resolve, reject) => {
    const filho = spawn(comando, args, {
      cwd: new URL(".", import.meta.url),
      stdio: "inherit",
      shell: isWindows,
      windowsHide: true,
      env: { ...process.env, DRIZZLE_DEV_SETUP: "1", FORCE_COLOR: process.env.FORCE_COLOR ?? "1" }
    });
    filho.on("error", reject);
    filho.on("exit", (codigo) => resolve(codigo ?? 1));
  });
}

async function schemaDevExiste() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const resultado = await client.query(
      `
        select
          to_regclass('public.empresas') as empresas,
          to_regclass('public.user') as usuario_auth,
          to_regclass('public.permissoes_cargos') as permissoes_cargos,
          exists (
            select 1
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'perfis_usuarios'
              and column_name = 'role'
          ) as tem_role,
          exists (
            select 1
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'perfis_usuarios'
              and column_name = 'papel'
          ) as tem_papel
      `
    );
    const linha = resultado.rows[0];
    return Boolean(
      linha.empresas && linha.usuario_auth && linha.permissoes_cargos && linha.tem_role && !linha.tem_papel
    );
  } finally {
    await client.end();
  }
}

async function aplicarMigracaoLegadaSemPrompt() {
  const client = new Client({ connectionString: databaseUrl });
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

      alter table if exists perfis_usuarios drop constraint if exists perfis_usuarios_papel_check;
      alter table if exists perfis_usuarios drop column if exists papel;
      alter table if exists perfis_usuarios add column if not exists role text not null default 'usuario_comum';
      alter table if exists perfis_usuarios drop constraint if exists perfis_usuarios_role_check;
      alter table if exists perfis_usuarios add constraint perfis_usuarios_role_check
        check (role in ('usuario_comum', 'usuario_admin', 'admin'));
      drop table if exists permissoes_papeis;

      do $$
      begin
        if to_regclass('public.cargos') is not null and to_regclass('public.permissoes') is not null then
          create table if not exists permissoes_cargos (
            cargo_id uuid not null references cargos(id) on delete cascade,
            regras jsonb not null default '{}'::jsonb,
            constraint permissoes_cargos_cargo_id_pk primary key (cargo_id)
          );
        end if;

        if to_regclass('public.colaboradores') is not null then
          if to_regclass('public.perfis_usuarios') is not null then
            update colaboradores
            set usuario_id = null
            where usuario_id is not null
              and not exists (
                select 1
                from perfis_usuarios
                where perfis_usuarios.usuario_id = colaboradores.usuario_id
              );
          end if;

          create unique index if not exists colaboradores_usuario_id_unico
            on colaboradores(usuario_id)
            where usuario_id is not null;
        end if;
      end $$;
    `);
  } finally {
    await client.end();
  }
}

/**
 * Paridade com quem provisiona por migrate. Duas metades, e as duas sao necessarias:
 *
 *  1. a 0002 inteira — cria a funcao `set_atualizado_em` e instala os triggers das tabelas que ela
 *     enumera num array literal;
 *  2. os triggers escritos a mao nas migrations posteriores — a 0002 nao volta atras, e o push nao
 *     conhece trigger, entao sem este passo o banco de dev fica sem o que producao tem.
 *
 * O passo 2 nao aplica migration nenhuma: le o SQL versionado, aceita so `*_set_atualizado_em`,
 * exige a funcao ja criada e pula o que ja existe.
 */
async function aplicarTriggersAtualizadoEm() {
  const sql = await readFile(migracaoTriggersUrl, "utf8");
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(sql);
    const manuais = await aplicarTriggersManuais(client);
    if (manuais.length > 0) {
      console.info(`[db:setup:dev] triggers manuais instalados: ${manuais.map((t) => t.tabela).join(", ")}`);
    }
  } finally {
    await client.end();
  }
}

await aplicarMigracaoLegadaSemPrompt();

const codigo = await executar("drizzle-kit", ["push", "--force"]);
if (codigo === 0) {
  await aplicarTriggersAtualizadoEm();
  process.exit(0);
}

if (await schemaDevExiste()) {
  console.warn("[db:setup:dev] drizzle-kit push falhou, mas o schema dev ja existe; seguindo para o seed.");
  await aplicarTriggersAtualizadoEm();
  process.exit(0);
}

console.error("[db:setup:dev] drizzle-kit push falhou e o schema dev esperado nao existe.");
process.exit(codigo);
