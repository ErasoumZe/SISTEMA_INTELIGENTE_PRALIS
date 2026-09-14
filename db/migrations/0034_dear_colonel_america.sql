CREATE TABLE "admissoes_testes" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"status" text DEFAULT 'em_teste' NOT NULL,
	"versao" integer DEFAULT 1 NOT NULL,
	"nome_completo" text NOT NULL,
	"cpf" text NOT NULL,
	"funcao_id" uuid NOT NULL,
	"jornada_horario" text NOT NULL,
	"inicio_em" timestamp with time zone NOT NULL,
	"fim_combinado_em" timestamp with time zone NOT NULL,
	"resultado" text,
	"motivo_cancelamento" text,
	"criado_por" text NOT NULL,
	"atualizado_por" text NOT NULL,
	"encerrado_por" text,
	"cancelado_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"encerrado_em" timestamp with time zone,
	"cancelado_em" timestamp with time zone,
	CONSTRAINT "admissoes_testes_id_empresa_unica" UNIQUE("id","empresa_id"),
	CONSTRAINT "admissoes_testes_status_check" CHECK ("admissoes_testes"."status" in ('em_teste', 'encerrado', 'cancelado')),
	CONSTRAINT "admissoes_testes_versao_check" CHECK ("admissoes_testes"."versao" > 0),
	CONSTRAINT "admissoes_testes_cpf_check" CHECK ("admissoes_testes"."cpf" ~ '^[0-9]{11}$'),
	CONSTRAINT "admissoes_testes_nome_check" CHECK (length(btrim("admissoes_testes"."nome_completo")) > 0),
	CONSTRAINT "admissoes_testes_jornada_check" CHECK (length(btrim("admissoes_testes"."jornada_horario")) > 0),
	CONSTRAINT "admissoes_testes_periodo_check" CHECK ("admissoes_testes"."fim_combinado_em" > "admissoes_testes"."inicio_em"),
	CONSTRAINT "admissoes_testes_resultado_check" CHECK ("admissoes_testes"."resultado" is null or "admissoes_testes"."resultado" in ('aprovado_para_admissao', 'nao_prosseguir')),
	CONSTRAINT "admissoes_testes_motivo_cancelamento_check" CHECK ("admissoes_testes"."motivo_cancelamento" is null or "admissoes_testes"."motivo_cancelamento" in ('nao_aprovado_no_teste', 'sem_continuidade_apos_dia_de_teste')),
	CONSTRAINT "admissoes_testes_coerencia_status_check" CHECK ((
        "admissoes_testes"."status" = 'em_teste'
        and "admissoes_testes"."resultado" is null
        and "admissoes_testes"."motivo_cancelamento" is null
        and "admissoes_testes"."encerrado_por" is null and "admissoes_testes"."encerrado_em" is null
        and "admissoes_testes"."cancelado_por" is null and "admissoes_testes"."cancelado_em" is null
      ) or (
        "admissoes_testes"."status" = 'encerrado'
        and "admissoes_testes"."resultado" is not null
        and "admissoes_testes"."motivo_cancelamento" is null
        and "admissoes_testes"."encerrado_por" is not null and "admissoes_testes"."encerrado_em" is not null
        and "admissoes_testes"."cancelado_por" is null and "admissoes_testes"."cancelado_em" is null
      ) or (
        "admissoes_testes"."status" = 'cancelado'
        and "admissoes_testes"."resultado" is null
        and "admissoes_testes"."motivo_cancelamento" is not null
        and "admissoes_testes"."encerrado_por" is null and "admissoes_testes"."encerrado_em" is null
        and "admissoes_testes"."cancelado_por" is not null and "admissoes_testes"."cancelado_em" is not null
      ))
);
--> statement-breakpoint
CREATE TABLE "admissoes_testes_historico" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"teste_id" uuid NOT NULL,
	"versao" integer NOT NULL,
	"acao" text NOT NULL,
	"ator_usuario_id" text NOT NULL,
	"campos_alterados" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ocorrido_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admissoes_testes_historico_acao_check" CHECK ("admissoes_testes_historico"."acao" in ('criado', 'alterado', 'encerrado', 'cancelado', 'cpf_revelado')),
	CONSTRAINT "admissoes_testes_historico_versao_check" CHECK ("admissoes_testes_historico"."versao" > 0)
);
--> statement-breakpoint
CREATE TABLE "funcoes_operacionais" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"cbo" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "funcoes_operacionais_empresa_nome_unica" UNIQUE("empresa_id","nome"),
	CONSTRAINT "funcoes_operacionais_id_empresa_unica" UNIQUE("id","empresa_id"),
	CONSTRAINT "funcoes_operacionais_nome_check" CHECK (length(btrim("funcoes_operacionais"."nome")) > 0),
	CONSTRAINT "funcoes_operacionais_cbo_check" CHECK ("funcoes_operacionais"."cbo" is null or "funcoes_operacionais"."cbo" ~ '^[0-9]{6}$')
);
--> statement-breakpoint
ALTER TABLE "admissoes_testes" ADD CONSTRAINT "admissoes_testes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_testes" ADD CONSTRAINT "admissoes_testes_criado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_testes" ADD CONSTRAINT "admissoes_testes_atualizado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_testes" ADD CONSTRAINT "admissoes_testes_encerrado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("encerrado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_testes" ADD CONSTRAINT "admissoes_testes_cancelado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("cancelado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_testes" ADD CONSTRAINT "admissoes_testes_funcao_empresa_fk" FOREIGN KEY ("funcao_id","empresa_id") REFERENCES "public"."funcoes_operacionais"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_testes_historico" ADD CONSTRAINT "admissoes_testes_historico_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_testes_historico" ADD CONSTRAINT "admissoes_testes_historico_ator_usuario_id_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("ator_usuario_id") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_testes_historico" ADD CONSTRAINT "admissoes_testes_historico_teste_empresa_fk" FOREIGN KEY ("teste_id","empresa_id") REFERENCES "public"."admissoes_testes"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funcoes_operacionais" ADD CONSTRAINT "funcoes_operacionais_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admissoes_testes_cpf_em_teste_unico" ON "admissoes_testes" USING btree ("empresa_id","cpf") WHERE "admissoes_testes"."status" = 'em_teste';--> statement-breakpoint
CREATE INDEX "admissoes_testes_empresa_status_fim_idx" ON "admissoes_testes" USING btree ("empresa_id","status","fim_combinado_em","id");--> statement-breakpoint
CREATE UNIQUE INDEX "admissoes_testes_historico_evento_unico" ON "admissoes_testes_historico" USING btree ("teste_id","versao") WHERE "admissoes_testes_historico"."acao" <> 'cpf_revelado';--> statement-breakpoint
CREATE INDEX "admissoes_testes_historico_teste_idx" ON "admissoes_testes_historico" USING btree ("empresa_id","teste_id","ocorrido_em","id");--> statement-breakpoint
CREATE INDEX "funcoes_operacionais_empresa_ativo_nome_idx" ON "funcoes_operacionais" USING btree ("empresa_id","ativo","nome");--> statement-breakpoint
-- ACRESCENTADO A MAO. O drizzle-kit nao gera trigger.
--
-- Neste sistema `atualizado_em` e mantido por trigger, e a funcao `set_atualizado_em()` foi criada
-- pela 0002. Aquela migration instala o trigger percorrendo um ARRAY LITERAL de nomes de tabela, e
-- nenhuma das tabelas desta migration esta nele.
--
-- Editar a 0002 criaria divergencia producao x dev: producao ja a executou, dev e teste a reaplicam
-- do zero. Por isso o trigger e instalado aqui.
--
-- Sem estes dois statements, `atualizado_em` congela no valor de criacao — e a coluna existe
-- justamente para a concorrencia otimista e a trilha de auditoria fazerem sentido.
--
-- `admissoes_testes_historico` NAO recebe trigger: e append-only e nao tem `atualizado_em`.
create trigger "funcoes_operacionais_set_atualizado_em"
  before update on "funcoes_operacionais"
  for each row execute function set_atualizado_em();--> statement-breakpoint
create trigger "admissoes_testes_set_atualizado_em"
  before update on "admissoes_testes"
  for each row execute function set_atualizado_em();