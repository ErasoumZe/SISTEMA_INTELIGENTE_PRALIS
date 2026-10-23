-- Migration 0069 — estrutura para a API Conplus: origem da importação (arquivo|api), estado da
-- busca automática por empresa+tipo e código do contrato Questor no vínculo do colaborador.
-- Aditiva: colunas novas são nulas ou têm default; nenhuma linha existente é reescrita.

CREATE TABLE "conplus_sincronizacao_estado" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"status" text DEFAULT 'ociosa' NOT NULL,
	"ultima_competencia" date,
	"cursor" text,
	"tentativas" integer DEFAULT 0 NOT NULL,
	"proxima_tentativa_em" timestamp with time zone,
	"bloqueio_token" text,
	"bloqueio_ate" timestamp with time zone,
	"ultima_execucao_em" timestamp with time zone,
	"ultimo_sucesso_em" timestamp with time zone,
	"ultima_importacao_id" uuid,
	"ultimo_erro_codigo" text,
	"ultimo_erro_mensagem" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conplus_sincronizacao_estado_empresa_tipo_unico" UNIQUE("empresa_id","tipo"),
	CONSTRAINT "conplus_sincronizacao_estado_tipo_check" CHECK ("conplus_sincronizacao_estado"."tipo" in ('folha_05', 'adiantamento_20', 'rescisoes', 'ferias')),
	CONSTRAINT "conplus_sincronizacao_estado_status_check" CHECK ("conplus_sincronizacao_estado"."status" in ('ociosa', 'executando', 'falhou')),
	CONSTRAINT "conplus_sincronizacao_estado_tentativas_check" CHECK ("conplus_sincronizacao_estado"."tentativas" >= 0),
	CONSTRAINT "conplus_sincronizacao_estado_bloqueio_check" CHECK (("conplus_sincronizacao_estado"."status" = 'executando') = ("conplus_sincronizacao_estado"."bloqueio_token" is not null and "conplus_sincronizacao_estado"."bloqueio_ate" is not null)),
	CONSTRAINT "conplus_sincronizacao_estado_cursor_check" CHECK ("conplus_sincronizacao_estado"."cursor" is null or length("conplus_sincronizacao_estado"."cursor") between 1 and 2000)
);
--> statement-breakpoint
ALTER TABLE "colaboradores_vinculos" ADD COLUMN "questor_codigo_contrato" text;--> statement-breakpoint
ALTER TABLE "conplus_importacoes" ADD COLUMN "origem" text DEFAULT 'arquivo' NOT NULL;--> statement-breakpoint
ALTER TABLE "conplus_sincronizacao_estado" ADD CONSTRAINT "conplus_sincronizacao_estado_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conplus_sincronizacao_estado" ADD CONSTRAINT "conplus_sincronizacao_estado_importacao_fk" FOREIGN KEY ("ultima_importacao_id","empresa_id") REFERENCES "public"."conplus_importacoes"("id","empresa_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conplus_sincronizacao_estado_bloqueio_unico" ON "conplus_sincronizacao_estado" USING btree ("bloqueio_token") WHERE "conplus_sincronizacao_estado"."bloqueio_token" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "colaboradores_vinculos_empresa_questor_contrato_unico" ON "colaboradores_vinculos" USING btree ("empresa_id","questor_codigo_contrato") WHERE "colaboradores_vinculos"."questor_codigo_contrato" is not null;--> statement-breakpoint
ALTER TABLE "colaboradores_vinculos" ADD CONSTRAINT "colaboradores_vinculos_questor_contrato_check" CHECK ("colaboradores_vinculos"."questor_codigo_contrato" is null or "colaboradores_vinculos"."questor_codigo_contrato" ~ '^[0-9]{1,7}$');--> statement-breakpoint
ALTER TABLE "conplus_importacoes" ADD CONSTRAINT "conplus_importacoes_origem_check" CHECK ("conplus_importacoes"."origem" in ('arquivo', 'api'));--> statement-breakpoint
CREATE TRIGGER "conplus_sincronizacao_estado_set_atualizado_em" BEFORE UPDATE ON "conplus_sincronizacao_estado" FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
