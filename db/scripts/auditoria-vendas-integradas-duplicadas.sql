-- ============================================================================================
-- Auditoria de VENDAS INTEGRADAS DUPLICADAS — pre-requisito da #41 (R-174/R-175)
-- --------------------------------------------------------------------------------------------
-- SOMENTE LEITURA. Nenhum INSERT, UPDATE ou DELETE. Nao ha secao comentada de limpeza aqui de
-- proposito: limpar duplicata e regularizacao de historico, PROIBIDA pela R-166 nesta entrega —
-- vira OS propria, medida, auditavel e autorizada.
--
-- PARA QUE SERVE: a #41 cria o indice unico parcial
--     (empresa_id, identificador_externo) WHERE integracao_chave_id is not null
--                                           and identificador_externo is not null
-- e `CREATE UNIQUE INDEX` FALHA de imediato se ja existir duplicata. Rode este script ANTES de
-- aplicar a migration 0032.
--
--   Secao 1 = zero  -> a migration entra direto.
--   Secao 1 > zero  -> a migration NAO pode ser aplicada. Pare e leve as secoes 2 e 3 para decisao.
--
-- Uso: psql "$DATABASE_URL" -f db/scripts/auditoria-vendas-integradas-duplicadas.sql
-- Desenho completo da issue: PROJECT_BRAIN/33_IDEMPOTENCIA_VENDA_INTEGRADA_41.md
-- ============================================================================================

-- Secao 1 — A resposta em uma linha. E o unico numero que decide se a migration pode ir.
select count(*)                  as grupos_duplicados,
       coalesce(sum(qtd - 1), 0) as linhas_excedentes
from (
  select empresa_id, identificador_externo, count(*) as qtd
    from vendas
   where integracao_chave_id is not null
     and identificador_externo is not null
   group by empresa_id, identificador_externo
  having count(*) > 1
) duplicadas;

-- Secao 2 — Quais sao, com impacto em dinheiro, chave e caixa.
--
-- `chaves_envolvidas` separa as DUAS causas sem precisar de outra consulta:
--   mais de uma chave  -> troca de credencial (o registro da integracao e escopado por chave,
--                         entao o mesmo idVenda foi lido como inedito depois da rotacao);
--   uma chave so       -> corrida de ingestao (as duas entregas passaram antes de qualquer
--                         serializacao, porque a primeira ingestao nao trava nada).
select v.empresa_id,
       v.identificador_externo,
       count(*)                                                     as qtd,
       array_agg(v.id                 order by v.criado_em)         as venda_ids,
       array_agg(v.criado_em          order by v.criado_em)         as criadas_em,
       array_agg(distinct v.integracao_chave_id)                    as chaves_envolvidas,
       array_agg(v.caixa_id           order by v.criado_em)         as caixas,
       array_agg(v.status             order by v.criado_em)         as status,
       array_agg(v.computar           order by v.criado_em)         as computar,
       sum(v.valor_original - v.valor_desconto + v.valor_acrescimo) as soma_liquida,
       max(v.valor_original - v.valor_desconto + v.valor_acrescimo) as liquido_unitario
  from vendas v
 where v.integracao_chave_id is not null
   and v.identificador_externo is not null
 group by v.empresa_id, v.identificador_externo
having count(*) > 1
 order by count(*) desc, soma_liquida desc;

-- Secao 3 — Quanto ja esta em caixa FECHADO. E o que nao pode ser mexido sem OS propria (R-166),
-- porque tocar nisso altera total congelado de fechamento.
select coalesce(fc.status, '(sem caixa)') as status_caixa,
       count(*)                           as vendas_no_grupo_duplicado
  from vendas v
  left join fechamentos_caixa fc on fc.id = v.caixa_id
 where (v.empresa_id, v.identificador_externo) in (
         select empresa_id, identificador_externo
           from vendas
          where integracao_chave_id is not null
            and identificador_externo is not null
          group by empresa_id, identificador_externo
         having count(*) > 1)
 group by coalesce(fc.status, '(sem caixa)')
 order by count(*) desc;

-- Secao 4 — Confirma que a venda de RETAGUARDA fica fora do indice parcial. O numero esperado e
-- ZERO: o payload de /api/vendas nao tem `identificadorExterno`, e `integracao_chave_id` so e
-- escrito pela ingestao. Se vier diferente de zero, o predicado do indice precisa ser revisto
-- ANTES de aplicar a migration.
select count(*) as vendas_manuais_com_identificador_externo
  from vendas
 where integracao_chave_id is null
   and identificador_externo is not null;
