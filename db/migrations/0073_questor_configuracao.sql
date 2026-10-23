CREATE TABLE "questor_codigos" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"tabela" text NOT NULL,
	"codigo" text NOT NULL,
	"descricao" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "questor_codigos_unico" UNIQUE("empresa_id","tabela","codigo"),
	CONSTRAINT "questor_codigos_tabela_check" CHECK ("questor_codigos"."tabela" in ('tipo_contrato', 'sindicato', 'cargo', 'escala', 'tipo_logradouro')),
	CONSTRAINT "questor_codigos_codigo_check" CHECK (case "questor_codigos"."tabela"
        when 'tipo_contrato' then "questor_codigos"."codigo" ~ '^[0-9]{1,3}$'
        when 'sindicato' then "questor_codigos"."codigo" ~ '^[0-9]{1,5}$'
        when 'cargo' then "questor_codigos"."codigo" ~ '^[0-9]{1,7}$'
        when 'escala' then "questor_codigos"."codigo" ~ '^[0-9]{1,6}$'
        when 'tipo_logradouro' then "questor_codigos"."codigo" ~ '^[0-9]{1,21}$'
        else false
      end),
	CONSTRAINT "questor_codigos_descricao_check" CHECK (length(btrim("questor_codigos"."descricao")) between 1 and 120)
);
--> statement-breakpoint
CREATE TABLE "questor_configuracoes" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"codigo_estabelecimento" integer,
	"classificacao_organograma" text,
	"utiliza_hora_centesimal" boolean,
	"padroes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"versao" integer DEFAULT 1 NOT NULL,
	"atualizado_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "questor_configuracoes_empresa_unica" UNIQUE("empresa_id"),
	CONSTRAINT "questor_configuracoes_estab_check" CHECK ("questor_configuracoes"."codigo_estabelecimento" is null or "questor_configuracoes"."codigo_estabelecimento" between 0 and 99999),
	CONSTRAINT "questor_configuracoes_organograma_check" CHECK ("questor_configuracoes"."classificacao_organograma" is null or length(btrim("questor_configuracoes"."classificacao_organograma")) between 1 and 20),
	CONSTRAINT "questor_configuracoes_padroes_check" CHECK (jsonb_typeof("questor_configuracoes"."padroes") = 'object'),
	CONSTRAINT "questor_configuracoes_versao_check" CHECK ("questor_configuracoes"."versao" > 0)
);
--> statement-breakpoint
ALTER TABLE "questor_codigos" ADD CONSTRAINT "questor_codigos_empresa_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questor_codigos" ADD CONSTRAINT "questor_codigos_criado_por_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questor_configuracoes" ADD CONSTRAINT "questor_configuracoes_empresa_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questor_configuracoes" ADD CONSTRAINT "questor_configuracoes_atualizado_por_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE TRIGGER "questor_configuracoes_set_atualizado_em" BEFORE UPDATE ON "questor_configuracoes" FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
--> statement-breakpoint
CREATE TRIGGER "questor_codigos_set_atualizado_em" BEFORE UPDATE ON "questor_codigos" FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
