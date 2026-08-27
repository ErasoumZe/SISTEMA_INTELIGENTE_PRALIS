CREATE TABLE "admissoes_processos_internos" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"processo_id" uuid NOT NULL,
	"data_admissao" date,
	"ctps_numero" text,
	"ctps_serie" text,
	"ctps_uf" text,
	"pis_pasep_nit" text,
	"exame_situacao" text DEFAULT 'pendente' NOT NULL,
	"exame_atualizado_em" timestamp with time zone,
	"exame_atualizado_por" text,
	"observacoes_rh" text,
	"versao" integer DEFAULT 1 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admissoes_processos_internos_processo_unico" UNIQUE("processo_id"),
	CONSTRAINT "admissoes_processos_internos_exame_check" CHECK ("admissoes_processos_internos"."exame_situacao" in ('pendente', 'guia_entregue', 'agendado', 'realizado', 'exige_acao')),
	CONSTRAINT "admissoes_processos_internos_versao_check" CHECK ("admissoes_processos_internos"."versao" > 0),
	CONSTRAINT "admissoes_processos_internos_ctps_uf_check" CHECK ("admissoes_processos_internos"."ctps_uf" is null or "admissoes_processos_internos"."ctps_uf" ~ '^[A-Z]{2}$'),
	CONSTRAINT "admissoes_processos_internos_pis_check" CHECK ("admissoes_processos_internos"."pis_pasep_nit" is null or "admissoes_processos_internos"."pis_pasep_nit" ~ '^[0-9]{11}$')
);
--> statement-breakpoint
ALTER TABLE "admissoes_processos_historico" DROP CONSTRAINT "admissoes_processos_historico_acao_check";--> statement-breakpoint
ALTER TABLE "admissoes_processos" ALTER COLUMN "teste_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "admissoes_processos" ADD COLUMN "origem" text DEFAULT 'teste_efetivado' NOT NULL;--> statement-breakpoint
ALTER TABLE "admissoes_processos" ADD COLUMN "funcao_id" uuid;--> statement-breakpoint
ALTER TABLE "admissoes_processos" ADD COLUMN "jornada_horario" text;--> statement-breakpoint
ALTER TABLE "admissoes_processos_internos" ADD CONSTRAINT "admissoes_processos_internos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_processos_internos" ADD CONSTRAINT "admissoes_processos_internos_exame_atualizado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("exame_atualizado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_processos_internos" ADD CONSTRAINT "admissoes_processos_internos_processo_empresa_fk" FOREIGN KEY ("processo_id","empresa_id") REFERENCES "public"."admissoes_processos"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admissoes_processos_internos_exame_idx" ON "admissoes_processos_internos" USING btree ("empresa_id","exame_situacao");--> statement-breakpoint
ALTER TABLE "admissoes_processos" ADD CONSTRAINT "admissoes_processos_funcao_empresa_fk" FOREIGN KEY ("funcao_id","empresa_id") REFERENCES "public"."funcoes_operacionais"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_processos" ADD CONSTRAINT "admissoes_processos_origem_check" CHECK ("admissoes_processos"."origem" in ('teste_efetivado', 'admissao_direta'));--> statement-breakpoint
ALTER TABLE "admissoes_processos" ADD CONSTRAINT "admissoes_processos_origem_coerencia_check" CHECK ((
        "admissoes_processos"."origem" = 'teste_efetivado'
        and "admissoes_processos"."teste_id" is not null
        and "admissoes_processos"."funcao_id" is null and "admissoes_processos"."jornada_horario" is null
      ) or (
        "admissoes_processos"."origem" = 'admissao_direta'
        and "admissoes_processos"."teste_id" is null
        and "admissoes_processos"."funcao_id" is not null and "admissoes_processos"."jornada_horario" is not null
      ));--> statement-breakpoint
ALTER TABLE "admissoes_processos_historico" ADD CONSTRAINT "admissoes_processos_historico_acao_check" CHECK ("admissoes_processos_historico"."acao" in ('criado', 'cancelado', 'internos_alterados', 'exame_alterado'));
--> statement-breakpoint
-- ACRESCENTADO A MAO. O drizzle-kit nao gera trigger.
--
-- `atualizado_em` e mantido por trigger neste sistema, e a 0002 instala percorrendo um ARRAY LITERAL
-- de nomes de tabela — `admissoes_processos_internos` nao esta nele. Editar a 0002 criaria
-- divergencia producao x dev.
--
-- Quem provisiona por push (dev e Testcontainers) recebe este bloco por `db/triggers-manuais.ts`,
-- que le o SQL versionado das migrations. Nao ha segunda lista.
--
-- `admissoes_processos_historico` NAO recebe: e append-only e nao tem `atualizado_em`.
create trigger "admissoes_processos_internos_set_atualizado_em"
  before update on "admissoes_processos_internos"
  for each row execute function set_atualizado_em();
