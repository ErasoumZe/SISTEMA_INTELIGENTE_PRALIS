ALTER TABLE "fornecedores" ADD COLUMN "categoria" text;--> statement-breakpoint
ALTER TABLE "produtos" ADD COLUMN "liberado_compra" boolean DEFAULT false NOT NULL;