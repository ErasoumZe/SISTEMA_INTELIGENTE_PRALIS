CREATE TABLE "produtos_historico_nomes" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"produto_id" uuid NOT NULL,
	"nome_anterior" text NOT NULL,
	"nome_novo" text NOT NULL,
	"alterado_por" text,
	"alterado_por_nome" text,
	"alterado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "produtos_historico_nomes" ADD CONSTRAINT "produtos_historico_nomes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produtos_historico_nomes" ADD CONSTRAINT "produtos_historico_nomes_alterado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("alterado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produtos_historico_nomes" ADD CONSTRAINT "produtos_historico_nomes_produto_empresa_fk" FOREIGN KEY ("produto_id","empresa_id") REFERENCES "public"."produtos"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "produtos_historico_nomes_empresa_produto_data_idx" ON "produtos_historico_nomes" USING btree ("empresa_id","produto_id","alterado_em" DESC NULLS LAST);