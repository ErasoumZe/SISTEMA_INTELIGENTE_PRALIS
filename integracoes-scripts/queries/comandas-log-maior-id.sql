-- Maior ID_LOG do log das comandas (pela PK): base da janela de leitura do log.
SELECT MAX(l.ID_LOG) AS maior
FROM log_comanda_venda_balcao l;
