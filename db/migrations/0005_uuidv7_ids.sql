CREATE EXTENSION IF NOT EXISTS pgcrypto;--> statement-breakpoint
CREATE OR REPLACE FUNCTION uuid_generate_v7()
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  unix_ts_ms bigint;
  bytes bytea;
BEGIN
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

  RETURN encode(bytes, 'hex')::uuid;
END;
$$;--> statement-breakpoint
DO $$
DECLARE
  tabela record;
BEGIN
  FOR tabela IN
    SELECT table_schema, table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'id'
      AND data_type = 'uuid'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ALTER COLUMN id SET DEFAULT uuid_generate_v7()',
      tabela.table_schema,
      tabela.table_name
    );
  END LOOP;
END $$;
