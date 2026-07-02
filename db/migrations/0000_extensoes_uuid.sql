-- Extensoes e funcoes base do banco. Precisa rodar antes do baseline:
-- as tabelas usam uuid_generate_v7() como DEFAULT e o Postgres resolve a funcao no CREATE TABLE.
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
