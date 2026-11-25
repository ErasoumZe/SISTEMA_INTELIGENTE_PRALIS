-- Quando o caixa puxou cada comanda e a venda que nasceu dela (importacao_comanda_venda_balcao tem indice em
-- ID_COMANDA). A ultima importacao vale: uma comanda puxada, devolvida e puxada de novo conta da ultima vez.
-- O log_comanda_venda_balcao NAO e lido: nao tem indice por comanda (~865 mil linhas).
SELECT
  i.ID_COMANDA AS idComanda,
  DATE_FORMAT(MAX(i.DTHR_IMPORTACAO), '%Y-%m-%d %H:%i:%s') AS puxadaEm,
  MAX(NULLIF(i.ID_VENDA_BALCAO, 0)) AS vendaCreareId
FROM importacao_comanda_venda_balcao i
WHERE i.ID_COMANDA IN (/*IDS*/)
GROUP BY i.ID_COMANDA;
