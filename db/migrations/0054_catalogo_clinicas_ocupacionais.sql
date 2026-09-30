CREATE TABLE "clinicas_ocupacionais" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"cnpj" text,
	"email" text,
	"whatsapp" text,
	"contato_nome" text,
	"observacoes" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clinicas_ocupacionais_id_empresa_unica" UNIQUE("id","empresa_id"),
	CONSTRAINT "clinicas_ocupacionais_empresa_nome_unico" UNIQUE("empresa_id","nome"),
	CONSTRAINT "clinicas_ocupacionais_nome_check" CHECK (length(btrim("clinicas_ocupacionais"."nome")) > 0),
	CONSTRAINT "clinicas_ocupacionais_cnpj_check" CHECK ("clinicas_ocupacionais"."cnpj" is null or "clinicas_ocupacionais"."cnpj" ~ '^[0-9]{14}$'),
	CONSTRAINT "clinicas_ocupacionais_whatsapp_check" CHECK ("clinicas_ocupacionais"."whatsapp" is null or "clinicas_ocupacionais"."whatsapp" ~ '^[0-9]{10,13}$')
);
--> statement-breakpoint
CREATE TABLE "clinicas_ocupacionais_unidades" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"clinica_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"email" text,
	"whatsapp" text,
	"cep" text,
	"logradouro" text,
	"numero" text,
	"complemento" text,
	"bairro" text,
	"municipio" text,
	"uf" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clinicas_ocupacionais_unidades_id_empresa_unica" UNIQUE("id","empresa_id"),
	CONSTRAINT "clinicas_ocupacionais_unidades_clinica_nome_unico" UNIQUE("clinica_id","nome"),
	CONSTRAINT "clinicas_ocupacionais_unidades_nome_check" CHECK (length(btrim("clinicas_ocupacionais_unidades"."nome")) > 0),
	CONSTRAINT "clinicas_ocupacionais_unidades_whatsapp_check" CHECK ("clinicas_ocupacionais_unidades"."whatsapp" is null or "clinicas_ocupacionais_unidades"."whatsapp" ~ '^[0-9]{10,13}$'),
	CONSTRAINT "clinicas_ocupacionais_unidades_cep_check" CHECK ("clinicas_ocupacionais_unidades"."cep" is null or "clinicas_ocupacionais_unidades"."cep" ~ '^[0-9]{8}$'),
	CONSTRAINT "clinicas_ocupacionais_unidades_uf_check" CHECK ("clinicas_ocupacionais_unidades"."uf" is null or "clinicas_ocupacionais_unidades"."uf" ~ '^[A-Z]{2}$')
);
--> statement-breakpoint
ALTER TABLE "clinicas_ocupacionais" ADD CONSTRAINT "clinicas_ocupacionais_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinicas_ocupacionais_unidades" ADD CONSTRAINT "clinicas_ocupacionais_unidades_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinicas_ocupacionais_unidades" ADD CONSTRAINT "clinicas_ocupacionais_unidades_clinica_empresa_fk" FOREIGN KEY ("clinica_id","empresa_id") REFERENCES "public"."clinicas_ocupacionais"("id","empresa_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clinicas_ocupacionais_empresa_ativo_nome_idx" ON "clinicas_ocupacionais" USING btree ("empresa_id","ativo","nome");--> statement-breakpoint
CREATE INDEX "clinicas_ocupacionais_unidades_clinica_ativo_nome_idx" ON "clinicas_ocupacionais_unidades" USING btree ("empresa_id","clinica_id","ativo","nome");
--> statement-breakpoint
CREATE TRIGGER "clinicas_ocupacionais_set_atualizado_em" BEFORE UPDATE ON "clinicas_ocupacionais" FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
--> statement-breakpoint
CREATE TRIGGER "clinicas_ocupacionais_unidades_set_atualizado_em" BEFORE UPDATE ON "clinicas_ocupacionais_unidades" FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
