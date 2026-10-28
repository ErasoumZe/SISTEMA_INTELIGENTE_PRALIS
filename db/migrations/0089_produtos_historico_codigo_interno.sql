CREATE TABLE "produtos_historico_codigo_interno" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid,
	"produto_id" uuid,
	"produto_base_id" uuid,
	"codigo_anterior" text,
	"codigo_novo" text NOT NULL,
	"fonte" text NOT NULL,
	"alterado_por" text,
	"alterado_por_nome" text,
	"alterado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "produtos_historico_codigo_interno_alvo_check" CHECK (("produtos_historico_codigo_interno"."empresa_id" is null and "produtos_historico_codigo_interno"."produto_base_id" is not null and "produtos_historico_codigo_interno"."produto_id" is null) or ("produtos_historico_codigo_interno"."empresa_id" is not null and "produtos_historico_codigo_interno"."produto_id" is not null and "produtos_historico_codigo_interno"."produto_base_id" is null))
);
--> statement-breakpoint
ALTER TABLE "produtos_historico_codigo_interno" ADD CONSTRAINT "prod_hist_codigo_empresa_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produtos_historico_codigo_interno" ADD CONSTRAINT "prod_hist_codigo_produto_fk" FOREIGN KEY ("produto_id","empresa_id") REFERENCES "public"."produtos"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produtos_historico_codigo_interno" ADD CONSTRAINT "prod_hist_codigo_base_fk" FOREIGN KEY ("produto_base_id") REFERENCES "public"."produtos_catalogo_base"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produtos_historico_codigo_interno" ADD CONSTRAINT "prod_hist_codigo_alterado_por_fk" FOREIGN KEY ("alterado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prod_hist_codigo_produto_idx" ON "produtos_historico_codigo_interno" USING btree ("empresa_id","produto_id","alterado_em" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "prod_hist_codigo_base_idx" ON "produtos_historico_codigo_interno" USING btree ("produto_base_id","alterado_em" DESC NULLS LAST);