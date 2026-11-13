CREATE TABLE "planilha_tesouraria_envios" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"fechamento_caixa_id" uuid NOT NULL,
	"aba" text NOT NULL,
	"linha_inicial" integer NOT NULL,
	"linhas" integer NOT NULL,
	"lido" jsonb NOT NULL,
	"enviado" jsonb NOT NULL,
	"enviado_por" text NOT NULL,
	"enviado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "planilha_tesouraria_envios_caixa_aba_unico" UNIQUE("fechamento_caixa_id","aba"),
	CONSTRAINT "planilha_tesouraria_envios_linhas_check" CHECK ("planilha_tesouraria_envios"."linhas" > 0 and "planilha_tesouraria_envios"."linha_inicial" >= 2)
);
--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "sigla_planilha" text;--> statement-breakpoint
ALTER TABLE "planilha_tesouraria_envios" ADD CONSTRAINT "planilha_tesouraria_envios_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planilha_tesouraria_envios" ADD CONSTRAINT "planilha_tesouraria_envios_fechamento_caixa_id_fechamentos_caixa_id_fk" FOREIGN KEY ("fechamento_caixa_id") REFERENCES "public"."fechamentos_caixa"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planilha_tesouraria_envios" ADD CONSTRAINT "planilha_tesouraria_envios_enviado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("enviado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_sigla_planilha_check" CHECK ("empresas"."sigla_planilha" is null or "empresas"."sigla_planilha" ~ '^[A-Z0-9]{2,10}$');