-- Itens das comandas pedidas (validos e cancelados: ITEM_CANCELADO = 'S' e cancelado).
SELECT
  ic.ID_ITEM_COMANDA AS idItem,
  ic.ID_COMANDA AS idComanda,
  ic.ID_PRODUTO AS produtoCodigo,
  ic.DESCRICAO_PRODUTO AS descricao,
  ic.QUANTIDADE AS quantidade,
  ic.TOTAL_ITEM_LIQUIDO AS valorTotal,
  ic.ID_FUNCIONARIO AS funcionarioCodigo,
  ic.ITEM_CANCELADO AS itemCancelado,
  DATE_FORMAT(ic.DTHR_ITEMCOMANDA, '%Y-%m-%d %H:%i:%s') AS lancadoEm
FROM item_comanda ic
WHERE ic.ID_COMANDA IN (/*IDS*/)
ORDER BY ic.ID_COMANDA, ic.ID_ITEM_COMANDA;
