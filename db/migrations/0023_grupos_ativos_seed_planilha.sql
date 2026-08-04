ALTER TABLE "grupos_despesas" ADD COLUMN "ativa" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "grupos_mercadorias" ADD COLUMN "ativa" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "grupos_retiradas" ADD COLUMN "ativa" boolean DEFAULT true NOT NULL;