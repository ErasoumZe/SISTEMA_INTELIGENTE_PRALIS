-- ============================================================================================
-- CORRECAO DE DADOS — BUG B (fuso na data contabil das vendas integradas)
--
-- NAO E MIGRATION. Nao altera schema. Script de correcao pontual, para rodar UMA vez, a mao,
-- com aprovacao explicita e backup previo. Nao entra em db/migrations nem roda no deploy.
--
-- O QUE ACONTECEU: ate a correcao, data_referencia da venda integrada era derivada com
-- toISOString() (UTC). Em America/Sao_Paulo (-03), toda venda a partir das 21:00 locais recebia
-- a data do DIA SEGUINTE — caindo no caixa errado, no fechamento errado e divergindo do CREARE.
--
-- O QUE ESTE SCRIPT FAZ: recalcula data_referencia a partir de data_venda (o instante real, que
-- sempre esteve correto) no fuso America/Sao_Paulo. So toca vendas INTEGRADAS (integracao_chave_id
-- preenchido) e que TENHAM data_venda. Venda manual nao e tocada: ela nao passou por esse caminho.
--
-- ATENCAO: mexer em data_referencia move a venda de dia contabil. Se o caixa daquele dia ja foi
-- FECHADO, os totais gravados em fechamentos_caixa (total_*, saldo) NAO sao recalculados por este
-- script — eles foram congelados no fechamento. Rode o PASSO 1 para ver o impacto antes de decidir.
-- ============================================================================================

-- --------------------------------------------------------------------------------------------
-- PASSO 1 — DIAGNOSTICO (somente leitura). Rode primeiro e leia o resultado.
-- Quantas vendas estao com a data errada, quanto dinheiro isso move e quais dias/caixas.
-- --------------------------------------------------------------------------------------------
SELECT
  v.data_referencia                                              AS data_atual_errada,
  (v.data_venda AT TIME ZONE 'America/Sao_Paulo')::date          AS data_correta,
  count(*)                                                       AS vendas,
  sum(v.valor_original - v.valor_desconto + v.valor_acrescimo)   AS valor_liquido_que_muda_de_dia,
  count(DISTINCT v.caixa_id)                                     AS caixas_afetados,
  count(*) FILTER (WHERE fc.status <> 'aberto')                  AS vendas_em_caixa_ja_fechado
FROM vendas v
LEFT JOIN fechamentos_caixa fc ON fc.id = v.caixa_id
WHERE v.integracao_chave_id IS NOT NULL
  AND v.data_venda IS NOT NULL
  AND v.data_referencia <> (v.data_venda AT TIME ZONE 'America/Sao_Paulo')::date
GROUP BY 1, 2
ORDER BY 1 DESC;

-- --------------------------------------------------------------------------------------------
-- PASSO 2 — CORRECAO. So rode depois de aprovar o resultado do PASSO 1 e de ter backup.
-- Transacao explicita: confira o "UPDATE n" e o SELECT de verificacao ANTES do COMMIT.
-- --------------------------------------------------------------------------------------------
-- BEGIN;
--
-- UPDATE vendas v
--    SET data_referencia = (v.data_venda AT TIME ZONE 'America/Sao_Paulo')::date
--  WHERE v.integracao_chave_id IS NOT NULL
--    AND v.data_venda IS NOT NULL
--    AND v.data_referencia <> (v.data_venda AT TIME ZONE 'America/Sao_Paulo')::date;
--
-- -- Verificacao: tem de voltar 0. Se voltar >0, NAO commite.
-- SELECT count(*) AS ainda_erradas
--   FROM vendas v
--  WHERE v.integracao_chave_id IS NOT NULL
--    AND v.data_venda IS NOT NULL
--    AND v.data_referencia <> (v.data_venda AT TIME ZONE 'America/Sao_Paulo')::date;
--
-- COMMIT;   -- ou ROLLBACK; se algo nao bater
-- --------------------------------------------------------------------------------------------

-- --------------------------------------------------------------------------------------------
-- PASSO 3 (opcional) — caixas fechados cujos totais congelados ficaram defasados pela correcao.
-- Este script NAO os reescreve: refazer fechamento e decisao de negocio, nao de dados.
-- --------------------------------------------------------------------------------------------
-- SELECT DISTINCT fc.id, fc.data_movimento, fc.status, p.nome AS pdv
--   FROM vendas v
--   JOIN fechamentos_caixa fc ON fc.id = v.caixa_id
--   LEFT JOIN pdvs p ON p.id = fc.pdv_id
--  WHERE v.integracao_chave_id IS NOT NULL
--    AND v.data_venda IS NOT NULL
--    AND fc.status <> 'aberto'
--    AND v.data_referencia <> (v.data_venda AT TIME ZONE 'America/Sao_Paulo')::date;
