CREATE TABLE "contas_usuarios" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"conta_id" uuid NOT NULL,
	"usuario_id" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contas_usuarios_unica" UNIQUE("conta_id","usuario_id")
);
--> statement-breakpoint
CREATE TABLE "lacres" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"numero" text NOT NULL,
	"transferencia_id" uuid,
	"origem" text NOT NULL,
	"rompido" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lacres_numero_unico" UNIQUE("empresa_id","numero"),
	CONSTRAINT "lacres_origem_check" CHECK ("lacres"."origem" in ('saida', 'retorno'))
);
--> statement-breakpoint
ALTER TABLE "contas_usuarios" ADD CONSTRAINT "contas_usuarios_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contas_usuarios" ADD CONSTRAINT "contas_usuarios_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contas_usuarios" ADD CONSTRAINT "contas_usuarios_usuario_id_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lacres" ADD CONSTRAINT "lacres_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lacres" ADD CONSTRAINT "lacres_transferencia_id_transferencias_id_fk" FOREIGN KEY ("transferencia_id") REFERENCES "public"."transferencias"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contas_usuarios_usuario_idx" ON "contas_usuarios" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "contas_usuarios_conta_idx" ON "contas_usuarios" USING btree ("conta_id");--> statement-breakpoint
CREATE INDEX "lacres_transf_idx" ON "lacres" USING btree ("transferencia_id");