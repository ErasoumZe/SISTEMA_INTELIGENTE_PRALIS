-- Menor e maior ID de comanda: limites da busca binaria do backfill (pela PK).
SELECT MIN(c.ID_COMANDA) AS menor, MAX(c.ID_COMANDA) AS maior
FROM comanda c;
