-- Comandas criadas depois da ultima que o sistema recebeu, pela PK. Pagina de 1000; o robo repete ate acabar.
SELECT c.ID_COMANDA AS idComanda
FROM comanda c
WHERE c.ID_COMANDA > ?
ORDER BY c.ID_COMANDA
LIMIT 1000;
