CREATE TABLE "admissoes_processos" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"teste_id" uuid NOT NULL,
	"status" text DEFAULT 'iniciado' NOT NULL,
	"versao" integer DEFAULT 1 NOT NULL,
	"criado_por" text NOT NULL,
	"atualizado_por" text NOT NULL,
	"cancelado_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelado_em" timestamp with time zone,
	CONSTRAINT "admissoes_processos_teste_unico" UNIQUE("teste_id"),
	CONSTRAINT "admissoes_processos_id_empresa_unica" UNIQUE("id","empresa_id"),
	CONSTRAINT "admissoes_processos_status_check" CHECK ("admissoes_processos"."status" in ('iniciado', 'cancelado')),
	CONSTRAINT "admissoes_processos_versao_check" CHECK ("admissoes_processos"."versao" > 0),
	CONSTRAINT "admissoes_processos_coerencia_status_check" CHECK ((
        "admissoes_processos"."status" = 'iniciado'
        and "admissoes_processos"."cancelado_por" is null and "admissoes_processos"."cancelado_em" is null
      ) or (
        "admissoes_processos"."status" = 'cancelado'
        and "admissoes_processos"."cancelado_por" is not null and "admissoes_processos"."cancelado_em" is not null
      ))
);
--> statement-breakpoint
CREATE TABLE "admissoes_processos_historico" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"processo_id" uuid NOT NULL,
	"versao" integer NOT NULL,
	"acao" text NOT NULL,
	"ator_usuario_id" text NOT NULL,
	"campos_alterados" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ocorrido_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admissoes_processos_historico_acao_check" CHECK ("admissoes_processos_historico"."acao" in ('criado', 'cancelado')),
	CONSTRAINT "admissoes_processos_historico_versao_check" CHECK ("admissoes_processos_historico"."versao" > 0)
);
--> statement-breakpoint
ALTER TABLE "admissoes_processos" ADD CONSTRAINT "admissoes_processos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_processos" ADD CONSTRAINT "admissoes_processos_criado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_processos" ADD CONSTRAINT "admissoes_processos_atualizado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_processos" ADD CONSTRAINT "admissoes_processos_cancelado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("cancelado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_processos" ADD CONSTRAINT "admissoes_processos_teste_empresa_fk" FOREIGN KEY ("teste_id","empresa_id") REFERENCES "public"."admissoes_testes"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_processos_historico" ADD CONSTRAINT "admissoes_processos_historico_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_processos_historico" ADD CONSTRAINT "admissoes_processos_historico_ator_usuario_id_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("ator_usuario_id") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_processos_historico" ADD CONSTRAINT "admissoes_processos_historico_processo_empresa_fk" FOREIGN KEY ("processo_id","empresa_id") REFERENCES "public"."admissoes_processos"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admissoes_processos_empresa_status_criado_idx" ON "admissoes_processos" USING btree ("empresa_id","status","criado_em","id");--> statement-breakpoint
CREATE UNIQUE INDEX "admissoes_processos_historico_evento_unico" ON "admissoes_processos_historico" USING btree ("processo_id","versao");--> statement-breakpoint
CREATE INDEX "admissoes_processos_historico_processo_idx" ON "admissoes_processos_historico" USING btree ("empresa_id","processo_id","ocorrido_em","id");--> statement-breakpoint
-- ACRESCENTADO A MAO. O drizzle-kit nao gera trigger.
--
-- Neste sistema `atualizado_em` e mantido por trigger, e a 0002 o instala percorrendo um ARRAY
-- LITERAL de nomes de tabela — `admissoes_processos` nao esta nele. Editar a 0002 criaria
-- divergencia producao x dev: producao ja a executou, dev e teste a reaplicam do zero.
--
-- `admissoes_processos_historico` NAO recebe: e append-only e nao tem `atualizado_em`.
create trigger "admissoes_processos_set_atualizado_em"
  before update on "admissoes_processos"
  for each row execute function set_atualizado_em();