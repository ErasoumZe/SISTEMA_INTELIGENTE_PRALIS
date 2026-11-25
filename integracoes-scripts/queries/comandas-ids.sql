-- Dados das comandas pedidas, pela PK.
SELECT
  c.ID_COMANDA AS idComanda,
  c.NUM_COMANDA AS numero,
  c.NUM_MESA AS mesa,
  c.STATUS_COMANDA AS status,
  DATE_FORMAT(c.DTHR_ABERTURA, '%Y-%m-%d %H:%i:%s') AS abertaEm,
  DATE_FORMAT(c.DTHR_ULTIMO_LANCAMENTO, '%Y-%m-%d %H:%i:%s') AS ultimoLancamentoEm,
  DATE_FORMAT(c.DTHR_FECHAMENTO, '%Y-%m-%d %H:%i:%s') AS fechadaEm,
  c.VALOR_SUBTOTAL AS valorSubtotal,
  c.VALOR_DESCONTO AS valorDesconto,
  c.VALOR_TOTAL AS valorTotal,
  c.NOME_CLIENTE AS nomeCliente,
  c.OBSERVACAO AS observacao
FROM comanda c
WHERE c.ID_COMANDA IN (/*IDS*/)
ORDER BY c.ID_COMANDA;
