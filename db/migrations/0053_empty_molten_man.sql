CREATE TABLE "configuracoes_menu_empresas" (
	"empresa_id" uuid PRIMARY KEY NOT NULL,
	"estrutura" jsonb DEFAULT '{"versao":1,"secoes":[]}'::jsonb NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "configuracoes_menu_empresas" ADD CONSTRAINT "configuracoes_menu_empresas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;