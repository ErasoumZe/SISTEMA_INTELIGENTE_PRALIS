-- Abertura da primeira comanda com ID >= ?, pela PK. Usada na busca binaria do backfill (os IDs crescem com o
-- tempo), para nao varrer a tabela por DTHR_ABERTURA.
SELECT c.ID_COMANDA AS idComanda, DATE_FORMAT(c.DTHR_ABERTURA, '%Y-%m-%d %H:%i:%s') AS abertaEm
FROM comanda c
WHERE c.ID_COMANDA >= ?
ORDER BY c.ID_COMANDA
LIMIT 1;
