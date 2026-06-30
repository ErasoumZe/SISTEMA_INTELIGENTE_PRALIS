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

alter table if exists integracoes_chaves add column if not exists codigo_hash text;

update integracoes_chaves
set codigo_hash = encode(digest(codigo, 'sha256'), 'hex')
where codigo_hash is null;

create unique index if not exists integracoes_chaves_codigo_hash_unico_idx
  on integracoes_chaves(codigo_hash)
  where codigo_hash is not null;

create or replace function set_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

do $$
declare
  tabela text;
begin
  foreach tabela in array array[
    'perfis_usuarios',
    'formas_pagamento',
    'pdvs',
    'clientes',
    'cargos',
    'colaboradores_cargos',
    'colaboradores_jornadas',
    'colaboradores_faltas_justificadas',
    'produtos_conversoes',
    'integracoes_campos_config',
    'integracoes_vinculos',
    'integracoes_registros',
    'vendas',
    'despesas',
    'mercadorias',
    'retiradas',
    'transferencias'
  ] loop
    if to_regclass('public.' || tabela) is not null then
      execute format('drop trigger if exists %I on %I', tabela || '_set_atualizado_em', tabela);
      execute format(
        'create trigger %I before update on %I for each row execute function set_atualizado_em()',
        tabela || '_set_atualizado_em',
        tabela
      );
    end if;
  end loop;
end $$;
