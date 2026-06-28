ALTER TABLE "lacres_malotes" ADD COLUMN IF NOT EXISTS "empresa_id" uuid;--> statement-breakpoint
UPDATE "lacres_malotes"
SET "empresa_id" = "malotes"."empresa_id"
FROM "malotes"
WHERE "lacres_malotes"."malote_id" = "malotes"."id"
  AND "lacres_malotes"."empresa_id" IS NULL;--> statement-breakpoint
ALTER TABLE "lacres_malotes" ALTER COLUMN "empresa_id" SET NOT NULL;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "lacres_malotes" ADD CONSTRAINT "lacres_malotes_empresa_id_empresas_id_fk"
    FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE cascade;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DROP INDEX IF EXISTS "lacres_malotes_numero_unico_idx";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lacres_malotes_empresa_numero_unico_idx"
  ON "lacres_malotes" ("empresa_id", lower("numero"));
