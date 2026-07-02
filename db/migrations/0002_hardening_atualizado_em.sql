-- Triggers de atualizado_em para todas as tabelas que possuem a coluna.
-- Idempotente de proposito: alem do drizzle-kit migrate (producao), este arquivo
-- e aplicado apos o drizzle-kit push pelos setups de dev (db/setup-dev.mjs) e de
-- teste (tests/setup/testcontainers.ts), mantendo paridade entre os ambientes.
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
    'produtos',
    'produtos_conversoes',
    'produtos_fiscal',
    'produtos_transformacao',
    'produtos_promocoes',
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
