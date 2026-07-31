-- R-040 — abrir o caixa informando o lacre E o ato de confirmar a transferencia.
-- Com isso o malote-ENTIDADE deixa de existir: nao ha mais estoque de malotes "disponiveis" a
-- escolher na abertura. O lacre nasce inline na transferencia (R-022) e vive em `lacres` como selo
-- de um EVENTO, com `rompido` (R-027).
--
-- ORDEM IMPORTA: primeiro o BACKFILL (nada do que `malotes` guardava pode se perder), so depois os
-- drops. Sem isso, o historico de qual lacre selou qual transferencia iria junto com a tabela.

-- 1) O numero do lacre volta para a propria transferencia (coluna que ja existia e estava vazia).
UPDATE "transferencias" t
SET "n_lacre_doc" = m."numero_lacre"
FROM "malotes" m
WHERE t."malote_id" = m."id" AND t."n_lacre_doc" IS NULL;
--> statement-breakpoint

-- 2) O lacre da abertura volta para o proprio caixa (idem).
UPDATE "fechamentos_caixa" c
SET "lacre_abertura" = m."numero_lacre"
FROM "malotes" m
WHERE c."malote_abertura_id" = m."id" AND c."lacre_abertura" IS NULL;
--> statement-breakpoint

-- 3) Cada vinculo antigo vira uma linha em `lacres` — o registro canonico a partir de agora.
--    origem: sangria/retorno selam a VOLTA; abertura/suprimento selam a IDA.
--    rompido: transferencia ja recebida teve o selo quebrado; pendente/agendada ainda nao.
--    ON CONFLICT protege o UNIQUE (empresa_id, numero) caso o numero ja tenha lacre proprio.
INSERT INTO "lacres" ("empresa_id", "numero", "transferencia_id", "origem", "rompido")
SELECT t."empresa_id", m."numero_lacre", t."id",
       CASE WHEN t."tipo" IN ('sangria', 'retorno') THEN 'retorno' ELSE 'saida' END,
       (t."status" = 'recebido')
FROM "transferencias" t
JOIN "malotes" m ON m."id" = t."malote_id"
WHERE t."malote_id" IS NOT NULL
ON CONFLICT ON CONSTRAINT "lacres_numero_unico" DO NOTHING;
--> statement-breakpoint

-- 4) Agora sim: solta as amarras e derruba a tabela. Sem CASCADE — as duas unicas dependencias sao
--    as FKs abaixo, e derrubar explicitamente evita levar junto algo que ninguem mapeou.
ALTER TABLE "fechamentos_caixa" DROP CONSTRAINT "fechamentos_caixa_malote_abertura_id_malotes_id_fk";
--> statement-breakpoint
ALTER TABLE "transferencias" DROP CONSTRAINT "transferencias_malote_id_malotes_id_fk";
--> statement-breakpoint
ALTER TABLE "fechamentos_caixa" DROP COLUMN "malote_abertura_id";
--> statement-breakpoint
ALTER TABLE "transferencias" DROP COLUMN "malote_id";
--> statement-breakpoint
DROP TABLE "malotes";
--> statement-breakpoint

-- 5) As permissoes do cadastro morto saem do catalogo e de quem as tinha. As regras por
--    cargo/setor/usuario sao um mapa jsonb (codigo -> bool), entao a limpeza e por chave.
UPDATE "permissoes_cargos"
SET "regras" = "regras" - 'cadastro_malotes_visualizar' - 'cadastro_malotes_criar' - 'cadastro_malotes_editar'
             - 'cadastro_malotes_excluir' - 'menu_malotes_mostrar' - 'menu_malotes_desabilitado'
WHERE "regras"::text LIKE '%malotes%';
--> statement-breakpoint
UPDATE "permissoes_setores"
SET "regras" = "regras" - 'cadastro_malotes_visualizar' - 'cadastro_malotes_criar' - 'cadastro_malotes_editar'
             - 'cadastro_malotes_excluir' - 'menu_malotes_mostrar' - 'menu_malotes_desabilitado'
WHERE "regras"::text LIKE '%malotes%';
--> statement-breakpoint
UPDATE "permissoes_usuarios"
SET "regras" = "regras" - 'cadastro_malotes_visualizar' - 'cadastro_malotes_criar' - 'cadastro_malotes_editar'
             - 'cadastro_malotes_excluir' - 'menu_malotes_mostrar' - 'menu_malotes_desabilitado'
WHERE "regras"::text LIKE '%malotes%';
--> statement-breakpoint
DELETE FROM "permissoes" WHERE "codigo" LIKE 'cadastro_malotes_%' OR "codigo" LIKE 'menu_malotes_%';
