ALTER TABLE "configuracoes_temas_telas" ADD COLUMN IF NOT EXISTS "empresa_id" uuid;--> statement-breakpoint
UPDATE "configuracoes_temas_telas"
SET "empresa_id" = (SELECT "id" FROM "empresas" ORDER BY "criado_em" LIMIT 1)
WHERE "empresa_id" IS NULL;--> statement-breakpoint
DELETE FROM "configuracoes_temas_telas" WHERE "empresa_id" IS NULL;--> statement-breakpoint
ALTER TABLE "configuracoes_temas_telas" ALTER COLUMN "empresa_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "configuracoes_temas_telas" DROP CONSTRAINT IF EXISTS "configuracoes_temas_telas_pkey";--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "configuracoes_temas_telas" ADD CONSTRAINT "configuracoes_temas_telas_empresa_id_empresas_id_fk"
    FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE cascade;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE "configuracoes_temas_telas" ADD PRIMARY KEY ("empresa_id", "tela");
