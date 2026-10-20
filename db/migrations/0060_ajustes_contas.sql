CREATE TABLE "ajustes_contas" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"conta_id" uuid NOT NULL,
	"valor" numeric(14, 2) NOT NULL,
	"saldo_anterior" numeric(14, 2) NOT NULL,
	"saldo_posterior" numeric(14, 2) NOT NULL,
	"motivo" text NOT NULL,
	"criado_por" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ajustes_contas_valor_nao_zero_check" CHECK ("ajustes_contas"."valor" <> 0)
);
--> statement-breakpoint
ALTER TABLE "ajustes_contas" ADD CONSTRAINT "ajustes_contas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ajustes_contas" ADD CONSTRAINT "ajustes_contas_criado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ajustes_contas" ADD CONSTRAINT "ajustes_contas_conta_empresa_fk" FOREIGN KEY ("conta_id","empresa_id") REFERENCES "public"."contas"("id","empresa_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ajustes_contas_conta_criado_em_idx" ON "ajustes_contas" USING btree ("conta_id","criado_em");