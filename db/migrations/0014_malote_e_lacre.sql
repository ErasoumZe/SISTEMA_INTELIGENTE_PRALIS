-- Malote === lacre (D3): a identidade do malote passa a ser o numero do lacre. Colapsa a tabela
-- lacres_malotes (1:N) em malotes (1:1) e remove codigo/descricao (o "saco"). Data-preserving:
-- backfill do lacre + split de malotes com >1 lacre (1 malote por lacre; valor no lacre primario).

ALTER TABLE "malotes" ADD COLUMN "numero_lacre" text;--> statement-breakpoint

-- SPLIT: malotes com >1 lacre viram 1 malote por lacre. Primario = disponivel > usado > cancelado,
-- depois menor numero; fica no malote original (mantem valor/status/FKs). Cada lacre EXTRA vira um
-- malote novo com valor 0 e status mapeado (disponivel->disponivel, usado->em_uso, cancelado->devolvido).
INSERT INTO "malotes" ("empresa_id", "numero_lacre", "valor", "status")
SELECT r."empresa_id", r."numero", 0,
  CASE r."status" WHEN 'disponivel' THEN 'disponivel' WHEN 'usado' THEN 'em_uso' ELSE 'devolvido' END
FROM (
  SELECT l."empresa_id", l."numero", l."status", l."malote_id",
    row_number() OVER (
      PARTITION BY l."malote_id"
      ORDER BY CASE l."status" WHEN 'disponivel' THEN 0 WHEN 'usado' THEN 1 ELSE 2 END, lower(l."numero")
    ) AS rn
  FROM "lacres_malotes" l
) r
WHERE r.rn > 1;--> statement-breakpoint

-- Backfill do malote original com o lacre PRIMARIO (rn = 1).
UPDATE "malotes" m
SET "numero_lacre" = r."numero"
FROM (
  SELECT l."malote_id", l."numero",
    row_number() OVER (
      PARTITION BY l."malote_id"
      ORDER BY CASE l."status" WHEN 'disponivel' THEN 0 WHEN 'usado' THEN 1 ELSE 2 END, lower(l."numero")
    ) AS rn
  FROM "lacres_malotes" l
) r
WHERE r."malote_id" = m."id" AND r.rn = 1;--> statement-breakpoint

-- Malotes sem NENHUM lacre: usa o codigo antigo como identidade (nao perder a linha).
UPDATE "malotes" SET "numero_lacre" = "codigo" WHERE "numero_lacre" IS NULL;--> statement-breakpoint

ALTER TABLE "malotes" ALTER COLUMN "numero_lacre" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "malotes_empresa_numero_lacre_unico_idx" ON "malotes" USING btree ("empresa_id",lower("numero_lacre"));--> statement-breakpoint

-- Repoint das transferencias: lacre_malote_id (-> lacres_malotes) vira o malote correspondente
-- (o lacre agora e um malote). Preenche malote_id onde faltava (retorno/sangria usavam so o lacre).
UPDATE "transferencias" t
SET "malote_id" = m."id"
FROM "lacres_malotes" l
JOIN "malotes" m ON lower(m."numero_lacre") = lower(l."numero") AND m."empresa_id" = l."empresa_id"
WHERE t."lacre_malote_id" = l."id" AND t."malote_id" IS NULL;--> statement-breakpoint

-- Drop do modelo antigo (saco/codigo + tabela de lacres + FK redundante).
ALTER TABLE "transferencias" DROP COLUMN "lacre_malote_id";--> statement-breakpoint
DROP TABLE "lacres_malotes" CASCADE;--> statement-breakpoint
ALTER TABLE "malotes" DROP CONSTRAINT IF EXISTS "malotes_empresa_id_codigo_key";--> statement-breakpoint
ALTER TABLE "malotes" DROP COLUMN "codigo";--> statement-breakpoint
ALTER TABLE "malotes" DROP COLUMN "descricao";
