CREATE TABLE "alteracoes_pos_fechamento_caixa" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"fechamento_caixa_id" uuid NOT NULL,
	"venda_id" uuid NOT NULL,
	"alterado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alteracoes_pos_fechamento_caixa_venda_unica" UNIQUE("fechamento_caixa_id","venda_id")
);
--> statement-breakpoint
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_id_empresa_unica" UNIQUE("id","empresa_id");--> statement-breakpoint
ALTER TABLE "alteracoes_pos_fechamento_caixa" ADD CONSTRAINT "alteracoes_pos_fechamento_caixa_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alteracoes_pos_fechamento_caixa" ADD CONSTRAINT "alteracoes_pos_fechamento_caixa_fechamento_empresa_fk" FOREIGN KEY ("fechamento_caixa_id","empresa_id") REFERENCES "public"."fechamentos_caixa"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alteracoes_pos_fechamento_caixa" ADD CONSTRAINT "alteracoes_pos_fechamento_caixa_venda_empresa_fk" FOREIGN KEY ("venda_id","empresa_id") REFERENCES "public"."vendas"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alteracoes_pos_fechamento_caixa_empresa_idx" ON "alteracoes_pos_fechamento_caixa" USING btree ("empresa_id","fechamento_caixa_id");
