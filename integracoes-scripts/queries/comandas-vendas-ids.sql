-- Valor final das vendas que nasceram das comandas, pela PK de venda_balcao.
SELECT vb.ID_VENDA_BALCAO AS idVendaBalcao, vb.VALOR_TOTAL AS valorTotal
FROM venda_balcao vb
WHERE vb.ID_VENDA_BALCAO IN (/*IDS*/);
