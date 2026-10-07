CREATE TABLE "fechamentos_caixa_conferencias_tesouraria" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"fechamento_caixa_id" uuid NOT NULL,
	"resultado" text NOT NULL,
	"observacao" text,
	"conferido_por" text NOT NULL,
	"conferido_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fechamentos_caixa_conferencias_tesouraria_resultado_check" CHECK ("fechamentos_caixa_conferencias_tesouraria"."resultado" in ('conferido', 'divergente')),
	CONSTRAINT "fechamentos_caixa_conferencias_tesouraria_observacao_check" CHECK ("fechamentos_caixa_conferencias_tesouraria"."resultado" = 'conferido'
        or ("fechamentos_caixa_conferencias_tesouraria"."observacao" is not null and length(btrim("fechamentos_caixa_conferencias_tesouraria"."observacao")) > 0))
);
--> statement-breakpoint
ALTER TABLE "fechamentos_caixa_conferencias_tesouraria" ADD CONSTRAINT "fechamentos_caixa_conferencias_tesouraria_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fechamentos_caixa_conferencias_tesouraria" ADD CONSTRAINT "fechamentos_caixa_conferencias_tesouraria_conferido_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("conferido_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fechamentos_caixa_conferencias_tesouraria" ADD CONSTRAINT "fechamentos_caixa_conferencias_tesouraria_caixa_empresa_fk" FOREIGN KEY ("fechamento_caixa_id","empresa_id") REFERENCES "public"."fechamentos_caixa"("id","empresa_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fechamentos_caixa_conferencias_tesouraria_caixa_idx" ON "fechamentos_caixa_conferencias_tesouraria" USING btree ("fechamento_caixa_id","conferido_em");