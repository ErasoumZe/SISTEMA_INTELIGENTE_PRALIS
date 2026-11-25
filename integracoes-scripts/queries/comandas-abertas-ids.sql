-- Comandas em aberto no CREARE agora (STATUS_COMANDA 1 aberta, 2 puxada no caixa, 4 desconhecido). Pelo indice
-- de STATUS_COMANDA; nunca filtrar por DTHR_ABERTURA (sem indice).
SELECT c.ID_COMANDA AS idComanda
FROM comanda c
WHERE c.STATUS_COMANDA IN (1, 2, 4)
ORDER BY c.ID_COMANDA;
