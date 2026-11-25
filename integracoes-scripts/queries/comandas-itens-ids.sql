-- Itens das comandas pedidas (validos e cancelados: ITEM_CANCELADO = 'S' e cancelado), pelo indice em ID_COMANDA.
-- Do funcionario so o NOME: a tabela funcionario tem SENHA, nunca SELECT *. item_comanda nao tem motivo de cancelamento.
SELECT
  ic.ID_ITEM_COMANDA AS idItem,
  ic.ID_COMANDA AS idComanda,
  ic.ID_PRODUTO AS produtoCodigo,
  ic.DESCRICAO_PRODUTO AS descricao,
  ic.QUANTIDADE AS quantidade,
  ic.TOTAL_ITEM_LIQUIDO AS valorTotal,
  ic.ID_FUNCIONARIO AS funcionarioCodigo,
  f.NOME AS funcionarioNome,
  ic.ITEM_CANCELADO AS itemCancelado,
  DATE_FORMAT(ic.DTHR_ITEMCOMANDA, '%Y-%m-%d %H:%i:%s') AS lancadoEm
FROM item_comanda ic
LEFT JOIN funcionario f ON f.ID_FUNCIONARIO = ic.ID_FUNCIONARIO
WHERE ic.ID_COMANDA IN (/*IDS*/)
ORDER BY ic.ID_COMANDA, ic.ID_ITEM_COMANDA;
