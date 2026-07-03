ALTER TABLE "itens_vendas" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "itens_vendas" CASCADE;--> statement-breakpoint
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_status_check" CHECK ("produtos"."status" in ('ativo', 'inativo'));--> statement-breakpoint
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_tipo_check" CHECK ("produtos"."tipo" in ('revenda', 'transformacao'));