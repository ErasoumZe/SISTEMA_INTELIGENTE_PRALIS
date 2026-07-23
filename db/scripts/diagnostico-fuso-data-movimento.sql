-- Diagnostico do fuso: fechamentos_caixa com data_movimento derivado em UTC (bug corrigido no
-- codigo em fc39e34). SOMENTE LEITURA — nao altera nada. Rodar na PRODUCAO antes de qualquer UPDATE.
--
--   psql "$DATABASE_URL_PROD" -f db/scripts/diagnostico-fuso-data-movimento.sql
--
-- diaNegocio() = (data_hora_abertura AT TIME ZONE 'America/Sao_Paulo')::date. Os afetados sao os
-- caixas abertos na janela ~21:00-23:59 BRT (quando o UTC ja virou o dia seguinte).

-- 1) Contagem de linhas com o dia contabil errado.
SELECT count(*) AS total_errados
FROM fechamentos_caixa
WHERE data_hora_abertura IS NOT NULL
  AND data_movimento <> (data_hora_abertura AT TIME ZONE 'America/Sao_Paulo')::date;

-- 2) Amostra (ate 30) para inspecao — id, o dia gravado, o instante e o dia LOCAL correto.
SELECT
  id,
  empresa_id,
  pdv_id,
  data_movimento                                                   AS data_movimento_gravado,
  data_hora_abertura,
  (data_hora_abertura AT TIME ZONE 'America/Sao_Paulo')::date       AS dia_local_correto,
  status
FROM fechamentos_caixa
WHERE data_hora_abertura IS NOT NULL
  AND data_movimento <> (data_hora_abertura AT TIME ZONE 'America/Sao_Paulo')::date
ORDER BY data_hora_abertura DESC
LIMIT 30;
