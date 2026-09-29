CREATE TABLE "colaboradores_dados_bancarios" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"colaborador_id" uuid NOT NULL,
	"banco" text,
	"agencia" text,
	"conta" text,
	"conta_digito" text,
	"conta_tipo" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "colaboradores_dados_bancarios_colaborador_unico" UNIQUE("colaborador_id")
);
--> statement-breakpoint
CREATE TABLE "colaboradores_dados_pessoais" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"colaborador_id" uuid NOT NULL,
	"nome_social" text,
	"nascimento" date,
	"sexo" text,
	"estado_civil" text,
	"raca_cor" text,
	"grau_instrucao" text,
	"nacionalidade" text,
	"naturalidade" text,
	"nome_mae" text,
	"nome_pai" text,
	"rg_numero" text,
	"rg_orgao" text,
	"rg_uf" text,
	"rg_emissao" date,
	"titulo_eleitor" text,
	"titulo_zona" text,
	"titulo_secao" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "colaboradores_dados_pessoais_colaborador_unico" UNIQUE("colaborador_id"),
	CONSTRAINT "colaboradores_dados_pessoais_sexo_check" CHECK ("colaboradores_dados_pessoais"."sexo" is null or "colaboradores_dados_pessoais"."sexo" in ('Masculino', 'Feminino')),
	CONSTRAINT "colaboradores_dados_pessoais_rg_uf_check" CHECK ("colaboradores_dados_pessoais"."rg_uf" is null or "colaboradores_dados_pessoais"."rg_uf" ~ '^[A-Z]{2}$')
);
--> statement-breakpoint
CREATE TABLE "colaboradores_enderecos" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"colaborador_id" uuid NOT NULL,
	"cep" text,
	"logradouro" text,
	"numero" text,
	"complemento" text,
	"bairro" text,
	"municipio" text,
	"uf" text,
	"telefone" text,
	"email" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "colaboradores_enderecos_colaborador_unico" UNIQUE("colaborador_id"),
	CONSTRAINT "colaboradores_enderecos_cep_check" CHECK ("colaboradores_enderecos"."cep" is null or "colaboradores_enderecos"."cep" ~ '^[0-9]{8}$'),
	CONSTRAINT "colaboradores_enderecos_uf_check" CHECK ("colaboradores_enderecos"."uf" is null or "colaboradores_enderecos"."uf" ~ '^[A-Z]{2}$'),
	CONSTRAINT "colaboradores_enderecos_telefone_check" CHECK ("colaboradores_enderecos"."telefone" is null or "colaboradores_enderecos"."telefone" ~ '^[0-9]{10,11}$')
);
--> statement-breakpoint
CREATE TABLE "colaboradores_onboarding" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"vinculo_id" uuid NOT NULL,
	"etapa" text DEFAULT 'em_cadastro' NOT NULL,
	"versao" integer DEFAULT 1 NOT NULL,
	"cadastro_completo_em" timestamp with time zone,
	"cadastro_completo_por" text,
	"enviado_contabilidade_em" timestamp with time zone,
	"enviado_contabilidade_por" text,
	"retorno_contabilidade_em" timestamp with time zone,
	"retorno_contabilidade_por" text,
	"observacao_retorno" text,
	"configurado_em" timestamp with time zone,
	"configurado_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "colaboradores_onboarding_vinculo_unico" UNIQUE("vinculo_id"),
	CONSTRAINT "colaboradores_onboarding_etapa_check" CHECK ("colaboradores_onboarding"."etapa" in ('em_cadastro','cadastro_completo','aguardando_contabilidade','retorno_contabilidade','pendente_configuracao','configurado')),
	CONSTRAINT "colaboradores_onboarding_versao_check" CHECK ("colaboradores_onboarding"."versao" > 0)
);
--> statement-breakpoint
ALTER TABLE "colaboradores_eventos" DROP CONSTRAINT "colaboradores_eventos_tipo_check";--> statement-breakpoint
ALTER TABLE "colaboradores_dados_bancarios" ADD CONSTRAINT "colaboradores_dados_bancarios_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colaboradores_dados_bancarios" ADD CONSTRAINT "colaboradores_dados_bancarios_colaborador_empresa_fk" FOREIGN KEY ("colaborador_id","empresa_id") REFERENCES "public"."colaboradores"("id","empresa_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colaboradores_dados_pessoais" ADD CONSTRAINT "colaboradores_dados_pessoais_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colaboradores_dados_pessoais" ADD CONSTRAINT "colaboradores_dados_pessoais_colaborador_empresa_fk" FOREIGN KEY ("colaborador_id","empresa_id") REFERENCES "public"."colaboradores"("id","empresa_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colaboradores_enderecos" ADD CONSTRAINT "colaboradores_enderecos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colaboradores_enderecos" ADD CONSTRAINT "colaboradores_enderecos_colaborador_empresa_fk" FOREIGN KEY ("colaborador_id","empresa_id") REFERENCES "public"."colaboradores"("id","empresa_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colaboradores_onboarding" ADD CONSTRAINT "colaboradores_onboarding_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colaboradores_onboarding" ADD CONSTRAINT "colaboradores_onboarding_cadastro_completo_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("cadastro_completo_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colaboradores_onboarding" ADD CONSTRAINT "colaboradores_onboarding_enviado_contabilidade_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("enviado_contabilidade_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colaboradores_onboarding" ADD CONSTRAINT "colaboradores_onboarding_retorno_contabilidade_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("retorno_contabilidade_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colaboradores_onboarding" ADD CONSTRAINT "colaboradores_onboarding_configurado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("configurado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colaboradores_onboarding" ADD CONSTRAINT "colaboradores_onboarding_vinculo_empresa_fk" FOREIGN KEY ("vinculo_id","empresa_id") REFERENCES "public"."colaboradores_vinculos"("id","empresa_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "colaboradores_onboarding_empresa_etapa_idx" ON "colaboradores_onboarding" USING btree ("empresa_id","etapa","atualizado_em");--> statement-breakpoint
create trigger "colaboradores_dados_bancarios_set_atualizado_em" before update on "colaboradores_dados_bancarios" for each row execute function set_atualizado_em();--> statement-breakpoint
create trigger "colaboradores_dados_pessoais_set_atualizado_em" before update on "colaboradores_dados_pessoais" for each row execute function set_atualizado_em();--> statement-breakpoint
create trigger "colaboradores_enderecos_set_atualizado_em" before update on "colaboradores_enderecos" for each row execute function set_atualizado_em();--> statement-breakpoint
create trigger "colaboradores_onboarding_set_atualizado_em" before update on "colaboradores_onboarding" for each row execute function set_atualizado_em();--> statement-breakpoint
ALTER TABLE "colaboradores_eventos" ADD CONSTRAINT "colaboradores_eventos_tipo_check" CHECK ("colaboradores_eventos"."tipo" in ('efetivado', 'recontratado', 'dados_cadastrais_atualizados', 'cadastro_concluido', 'enviado_contabilidade', 'vinculo_desligado'));
