-- ============================================================================================
-- Auditoria de colaboradores DUPLICADOS (bug do QA de 15/07/2026)
-- --------------------------------------------------------------------------------------------
-- SOMENTE LEITURA ate a Secao 5 (que esta COMENTADA). Rode as secoes 1-4, revise o resultado e
-- so entao decida sobre a limpeza. O fix de codigo (dedup por CPF na criacao de usuario) ja evita
-- NOVOS duplicados; este script serve para inspecionar/limpar os que ja existem.
--
-- Uso: psql "$DATABASE_URL" -f db/scripts/auditoria-colaboradores-duplicados.sql
-- ============================================================================================

-- Secao 1 — Todas as FKs que apontam para colaboradores (o que checar antes de remover).
-- confdeltype: 'c' = ON DELETE CASCADE (some junto, ex.: cargos), outros = referencia "dura".
select
  conrelid::regclass::text as tabela,
  a.attname                as coluna,
  case c.confdeltype when 'c' then 'cascade' when 'a' then 'no_action' when 'r' then 'restrict'
                     when 'n' then 'set_null' when 'd' then 'set_default' end as on_delete
from pg_constraint c
join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
where c.contype = 'f' and c.confrelid = 'colaboradores'::regclass
order by on_delete, tabela, coluna;

-- Secao 2 — Duplicados por CPF (mesmo CPF na mesma empresa).
select
  empresa_id,
  cpf,
  count(*)                          as qtd,
  array_agg(id order by id)         as ids,
  array_agg(nome order by id)       as nomes,
  array_agg(usuario_id order by id) as usuario_ids
from colaboradores
where cpf is not null and cpf <> ''
group by empresa_id, cpf
having count(*) > 1
order by qtd desc, empresa_id;

-- Secao 3 — Duplicados por nome normalizado, quando NAO ha CPF (heuristica; pode ter homonimos).
select
  empresa_id,
  lower(btrim(nome))                as nome_normalizado,
  count(*)                          as qtd,
  array_agg(id order by id)         as ids,
  array_agg(usuario_id order by id) as usuario_ids
from colaboradores
where cpf is null or cpf = ''
group by empresa_id, lower(btrim(nome))
having count(*) > 1
order by qtd desc, empresa_id;

-- Funcao auxiliar (sessao-local, some ao sair): conta referencias "duras" (nao-cascade) de um
-- colaborador. Cascade (ex.: colaboradores_cargos) some junto com o colaborador, entao nao conta.
create or replace function pg_temp.colaborador_ref_duras(p_id uuid)
returns bigint language plpgsql as $$
declare fk record; total bigint := 0; n bigint;
begin
  for fk in
    select conrelid::regclass::text as tabela, a.attname as coluna
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.contype = 'f' and c.confrelid = 'colaboradores'::regclass and c.confdeltype <> 'c'
  loop
    execute format('select count(*) from %s where %I = $1', fk.tabela, fk.coluna) into n using p_id;
    total := total + n;
  end loop;
  return total;
end $$;

-- Secao 4 — Candidatos SEGUROS para remover: e duplicado (ha outro com o mesmo CPF), NAO esta
-- vinculado a usuario e NAO tem referencia dura (vendas/retiradas/fechamentos/...). O "titular"
-- que fica e o irmao vinculado a usuario ou, na falta, o mais antigo (menor id).
select
  c.id,
  c.empresa_id,
  c.nome,
  c.cpf,
  pg_temp.colaborador_ref_duras(c.id) as referencias_duras
from colaboradores c
where c.usuario_id is null
  and pg_temp.colaborador_ref_duras(c.id) = 0
  and exists (
    select 1 from colaboradores d
    where d.empresa_id = c.empresa_id
      and d.cpf is not null and d.cpf = c.cpf
      and d.id <> c.id
  )
order by c.empresa_id, c.cpf, c.id;

-- ============================================================================================
-- Secao 5 — LIMPEZA (DESTRUTIVA). NAO rode sem revisar a Secao 4 e sem backup. Descomente por sua
-- conta. Remove apenas os candidatos seguros da Secao 4 (unlinked, duplicados por CPF, sem
-- referencia dura). As linhas em tabelas cascade (ex.: colaboradores_cargos) somem junto.
-- --------------------------------------------------------------------------------------------
-- begin;
--   delete from colaboradores c
--   where c.usuario_id is null
--     and pg_temp.colaborador_ref_duras(c.id) = 0
--     and exists (
--       select 1 from colaboradores d
--       where d.empresa_id = c.empresa_id
--         and d.cpf is not null and d.cpf = c.cpf
--         and d.id <> c.id
--     );
--   -- Confira a contagem afetada antes de confirmar:
-- commit;   -- ou rollback;
-- ============================================================================================
