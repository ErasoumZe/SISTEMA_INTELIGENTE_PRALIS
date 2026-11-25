-- Hora em que o caixa puxou as comandas que estao no caixa (status 2). A importacao_comanda_venda_balcao so ganha
-- linha quando a venda fecha; enquanto a comanda esta no caixa, so o log tem o "IMPORTOU A COMANDA". O log nao tem
-- indice por comanda (~865 mil linhas): a leitura e por FAIXA DA PK (ID_LOG > ?, as ultimas ~20 mil linhas, perto de
-- 10 dias) e so depois filtra a comanda e o texto.
SELECT
  l.ID_COMANDA AS idComanda,
  DATE_FORMAT(MAX(l.DTHR_LOG), '%Y-%m-%d %H:%i:%s') AS puxadaEm
FROM log_comanda_venda_balcao l
WHERE l.ID_LOG > ?
  AND l.ID_COMANDA IN (/*IDS*/)
  AND l.DESCRICAO LIKE 'IMPORTOU A COMANDA%'
GROUP BY l.ID_COMANDA;
