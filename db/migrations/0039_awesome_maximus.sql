CREATE TABLE "admissoes_convites" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"processo_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"aviso_privacidade_versao" text NOT NULL,
	"criado_por" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"primeiro_acesso_em" timestamp with time zone,
	"ultimo_acesso_em" timestamp with time zone,
	"revogado_em" timestamp with time zone,
	"revogado_por" text,
	CONSTRAINT "admissoes_convites_id_empresa_unica" UNIQUE("id","empresa_id"),
	CONSTRAINT "admissoes_convites_token_hash_unico" UNIQUE("token_hash"),
	CONSTRAINT "admissoes_convites_token_hash_check" CHECK ("admissoes_convites"."token_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "admissoes_convites_validade_check" CHECK ("admissoes_convites"."expira_em" > "admissoes_convites"."criado_em"),
	CONSTRAINT "admissoes_convites_revogacao_check" CHECK (num_nonnulls("admissoes_convites"."revogado_em", "admissoes_convites"."revogado_por") <> 1),
	CONSTRAINT "admissoes_convites_acesso_check" CHECK ("admissoes_convites"."ultimo_acesso_em" is null or "admissoes_convites"."primeiro_acesso_em" is not null)
);
--> statement-breakpoint
CREATE TABLE "admissoes_processos_dependentes" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"processo_id" uuid NOT NULL,
	"nome_completo" text NOT NULL,
	"nascimento" date NOT NULL,
	"parentesco" text NOT NULL,
	"cpf" text,
	"finalidades" text[] DEFAULT '{}'::text[] NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admissoes_processos_dependentes_nome_check" CHECK (length(btrim("admissoes_processos_dependentes"."nome_completo")) > 0),
	CONSTRAINT "admissoes_processos_dependentes_cpf_check" CHECK ("admissoes_processos_dependentes"."cpf" is null or "admissoes_processos_dependentes"."cpf" ~ '^[0-9]{11}$')
);
--> statement-breakpoint
CREATE TABLE "admissoes_processos_ficha" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"processo_id" uuid NOT NULL,
	"situacao" text DEFAULT 'rascunho' NOT NULL,
	"versao" integer DEFAULT 1 NOT NULL,
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
	"cep" text,
	"logradouro" text,
	"numero" text,
	"complemento" text,
	"bairro" text,
	"municipio" text,
	"uf" text,
	"telefone" text,
	"email" text,
	"rg_numero" text,
	"rg_orgao" text,
	"rg_uf" text,
	"rg_emissao" date,
	"titulo_eleitor" text,
	"titulo_zona" text,
	"titulo_secao" text,
	"banco" text,
	"agencia" text,
	"conta" text,
	"conta_digito" text,
	"conta_tipo" text,
	"sem_dependentes" boolean,
	"aviso_privacidade_versao" text,
	"aviso_aceito_em" timestamp with time zone,
	"enviado_em" timestamp with time zone,
	"revisado_em" timestamp with time zone,
	"revisado_por" text,
	"revisao_pendencias" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admissoes_processos_ficha_processo_unico" UNIQUE("processo_id"),
	CONSTRAINT "admissoes_processos_ficha_situacao_check" CHECK ("admissoes_processos_ficha"."situacao" in ('rascunho', 'enviada', 'devolvida', 'aprovada')),
	CONSTRAINT "admissoes_processos_ficha_versao_check" CHECK ("admissoes_processos_ficha"."versao" > 0),
	CONSTRAINT "admissoes_processos_ficha_uf_check" CHECK ("admissoes_processos_ficha"."uf" is null or "admissoes_processos_ficha"."uf" ~ '^[A-Z]{2}$'),
	CONSTRAINT "admissoes_processos_ficha_rg_uf_check" CHECK ("admissoes_processos_ficha"."rg_uf" is null or "admissoes_processos_ficha"."rg_uf" ~ '^[A-Z]{2}$'),
	CONSTRAINT "admissoes_processos_ficha_cep_check" CHECK ("admissoes_processos_ficha"."cep" is null or "admissoes_processos_ficha"."cep" ~ '^[0-9]{8}$'),
	CONSTRAINT "admissoes_processos_ficha_coerencia_check" CHECK ((
        ("admissoes_processos_ficha"."situacao" = 'rascunho' and "admissoes_processos_ficha"."enviado_em" is null and "admissoes_processos_ficha"."revisado_em" is null)
        or ("admissoes_processos_ficha"."situacao" = 'enviada' and "admissoes_processos_ficha"."enviado_em" is not null and "admissoes_processos_ficha"."revisado_em" is null
            and "admissoes_processos_ficha"."aviso_aceito_em" is not null and "admissoes_processos_ficha"."aviso_privacidade_versao" is not null
            and "admissoes_processos_ficha"."sem_dependentes" is not null)
        or ("admissoes_processos_ficha"."situacao" = 'devolvida' and "admissoes_processos_ficha"."enviado_em" is not null
            and "admissoes_processos_ficha"."revisado_em" is not null and "admissoes_processos_ficha"."revisado_por" is not null
            and "admissoes_processos_ficha"."revisao_pendencias" is not null)
        or ("admissoes_processos_ficha"."situacao" = 'aprovada' and "admissoes_processos_ficha"."enviado_em" is not null
            and "admissoes_processos_ficha"."revisado_em" is not null and "admissoes_processos_ficha"."revisado_por" is not null)
      ))
);
--> statement-breakpoint
ALTER TABLE "admissoes_processos_historico" DROP CONSTRAINT "admissoes_processos_historico_acao_check";--> statement-breakpoint
DROP INDEX "admissoes_processos_historico_evento_unico";--> statement-breakpoint
ALTER TABLE "admissoes_processos_historico" ALTER COLUMN "ator_usuario_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "admissoes_processos_historico" ADD COLUMN "convite_id" uuid;--> statement-breakpoint
ALTER TABLE "admissoes_convites" ADD CONSTRAINT "admissoes_convites_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_convites" ADD CONSTRAINT "admissoes_convites_criado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_convites" ADD CONSTRAINT "admissoes_convites_revogado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("revogado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_convites" ADD CONSTRAINT "admissoes_convites_processo_empresa_fk" FOREIGN KEY ("processo_id","empresa_id") REFERENCES "public"."admissoes_processos"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_processos_dependentes" ADD CONSTRAINT "admissoes_processos_dependentes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_processos_dependentes" ADD CONSTRAINT "admissoes_processos_dependentes_processo_empresa_fk" FOREIGN KEY ("processo_id","empresa_id") REFERENCES "public"."admissoes_processos"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_processos_ficha" ADD CONSTRAINT "admissoes_processos_ficha_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_processos_ficha" ADD CONSTRAINT "admissoes_processos_ficha_revisado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("revisado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_processos_ficha" ADD CONSTRAINT "admissoes_processos_ficha_processo_empresa_fk" FOREIGN KEY ("processo_id","empresa_id") REFERENCES "public"."admissoes_processos"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admissoes_convites_processo_vigente_unico" ON "admissoes_convites" USING btree ("processo_id") WHERE "admissoes_convites"."revogado_em" is null;--> statement-breakpoint
CREATE INDEX "admissoes_convites_empresa_processo_idx" ON "admissoes_convites" USING btree ("empresa_id","processo_id","criado_em");--> statement-breakpoint
CREATE UNIQUE INDEX "admissoes_processos_dependentes_cpf_unico" ON "admissoes_processos_dependentes" USING btree ("processo_id","cpf") WHERE "admissoes_processos_dependentes"."cpf" is not null;--> statement-breakpoint
CREATE INDEX "admissoes_processos_dependentes_empresa_processo_idx" ON "admissoes_processos_dependentes" USING btree ("empresa_id","processo_id");--> statement-breakpoint
CREATE INDEX "admissoes_processos_ficha_empresa_situacao_idx" ON "admissoes_processos_ficha" USING btree ("empresa_id","situacao");--> statement-breakpoint
CREATE INDEX "admissoes_processos_ficha_aviso_teste_idx" ON "admissoes_processos_ficha" USING btree ("empresa_id") WHERE "admissoes_processos_ficha"."aviso_privacidade_versao" like 'AVISO-TESTE-%';--> statement-breakpoint
ALTER TABLE "admissoes_processos_historico" ADD CONSTRAINT "admissoes_processos_historico_convite_empresa_fk" FOREIGN KEY ("convite_id","empresa_id") REFERENCES "public"."admissoes_convites"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admissoes_processos_historico_evento_unico" ON "admissoes_processos_historico" USING btree ("processo_id","versao") WHERE "admissoes_processos_historico"."acao" not in ('cpf_revelado', 'convite_gerado', 'convite_revogado', 'ficha_enviada', 'ficha_devolvida', 'ficha_aprovada');--> statement-breakpoint
ALTER TABLE "admissoes_processos_historico" ADD CONSTRAINT "admissoes_processos_historico_autoria_check" CHECK (num_nonnulls("admissoes_processos_historico"."ator_usuario_id", "admissoes_processos_historico"."convite_id") = 1);--> statement-breakpoint
ALTER TABLE "admissoes_processos_historico" ADD CONSTRAINT "admissoes_processos_historico_acao_check" CHECK ("admissoes_processos_historico"."acao" in ('criado', 'cancelado', 'internos_alterados', 'exame_alterado', 'pausado', 'retomado', 'cpf_revelado', 'convite_gerado', 'convite_revogado', 'ficha_enviada', 'ficha_devolvida', 'ficha_aprovada'));
--> statement-breakpoint
-- ACRESCENTADO A MAO. O drizzle-kit nao gera trigger.
--
-- `atualizado_em` e mantido por trigger neste sistema, e a 0002 instala percorrendo um ARRAY LITERAL
-- de nomes de tabela — as tabelas novas nao estao nele. Editar a 0002 criaria divergencia entre
-- producao e dev.
--
-- Quem provisiona por push (dev e Testcontainers) recebe estes blocos por `db/triggers-manuais.ts`,
-- que le o SQL versionado das migrations. Nao ha segunda lista.
--
-- `admissoes_convites` NAO recebe trigger de proposito: convite nao se edita, e por isso a tabela
-- nem tem `atualizado_em`. Acesso e revogacao tem colunas proprias.
create trigger "admissoes_processos_ficha_set_atualizado_em"
  before update on "admissoes_processos_ficha"
  for each row execute function set_atualizado_em();
--> statement-breakpoint
create trigger "admissoes_processos_dependentes_set_atualizado_em"
  before update on "admissoes_processos_dependentes"
  for each row execute function set_atualizado_em();
