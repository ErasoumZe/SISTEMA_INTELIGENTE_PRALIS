-- Migration 0070 — eventos variáveis no layout oficial da Conplus (EventoVariavel.nli, 22/10/2026):
-- código e razão social da empresa no Questor, dados do catálogo oficial, período de cálculo do arquivo,
-- retrato de cada linha oficial (período + contrato + sequência) com a chave do Questor única,
-- cancelamento lógico de lançamento e trilha de auditoria (downloads, recusas, cancelamentos).
-- Aditiva para dados: colunas novas nulas; a unicidade do lançamento passa a ignorar os cancelados.

CREATE TABLE "questor_auditoria" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"usuario_id" text NOT NULL,
	"acao" text NOT NULL,
	"exportacao_id" uuid,
	"detalhes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "questor_auditoria_acao_check" CHECK ("questor_auditoria"."acao" in ('download', 'recusa_homologacao', 'recusa_catalogo', 'cancelamento_lancamento'))
);
--> statement-breakpoint
ALTER TABLE "questor_eventos_variaveis_lancamentos" DROP CONSTRAINT "questor_eventos_variaveis_lancamentos_unico";--> statement-breakpoint
ALTER TABLE "questor_configuracoes" ADD COLUMN "codigo_empresa_questor" integer;--> statement-breakpoint
ALTER TABLE "questor_configuracoes" ADD COLUMN "razao_social_questor" text;--> statement-breakpoint
ALTER TABLE "questor_eventos_variaveis" ADD COLUMN "sequencia_questor" integer;--> statement-breakpoint
ALTER TABLE "questor_eventos_variaveis" ADD COLUMN "filial_questor" integer;--> statement-breakpoint
ALTER TABLE "questor_eventos_variaveis" ADD COLUMN "natureza" text;--> statement-breakpoint
ALTER TABLE "questor_eventos_variaveis_lancamentos" ADD COLUMN "cancelado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "questor_eventos_variaveis_lancamentos" ADD COLUMN "cancelado_por" text;--> statement-breakpoint
ALTER TABLE "questor_eventos_variaveis_lancamentos" ADD COLUMN "motivo_cancelamento" text;--> statement-breakpoint
ALTER TABLE "questor_exportacoes" ADD COLUMN "codigo_periodo_calculo" text;--> statement-breakpoint
ALTER TABLE "questor_exportacoes_eventos_variaveis" ADD COLUMN "codigo_periodo_calculo" text;--> statement-breakpoint
ALTER TABLE "questor_exportacoes_eventos_variaveis" ADD COLUMN "codigo_contrato" text;--> statement-breakpoint
ALTER TABLE "questor_exportacoes_eventos_variaveis" ADD COLUMN "sequencia" integer;--> statement-breakpoint
ALTER TABLE "questor_auditoria" ADD CONSTRAINT "questor_auditoria_empresa_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questor_auditoria" ADD CONSTRAINT "questor_auditoria_usuario_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questor_auditoria" ADD CONSTRAINT "questor_auditoria_exportacao_fk" FOREIGN KEY ("exportacao_id","empresa_id") REFERENCES "public"."questor_exportacoes"("id","empresa_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "questor_auditoria_empresa_data_idx" ON "questor_auditoria" USING btree ("empresa_id","criado_em");--> statement-breakpoint
ALTER TABLE "questor_eventos_variaveis_lancamentos" ADD CONSTRAINT "questor_eventos_variaveis_lancamentos_cancelado_por_fk" FOREIGN KEY ("cancelado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "questor_eventos_variaveis_lancamentos_unico" ON "questor_eventos_variaveis_lancamentos" USING btree ("empresa_id","competencia","vinculo_id","evento_id") WHERE "questor_eventos_variaveis_lancamentos"."cancelado_em" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "questor_exportacoes_eventos_chave_questor_unica" ON "questor_exportacoes_eventos_variaveis" USING btree ("empresa_id","codigo_periodo_calculo","codigo_contrato","sequencia") WHERE "questor_exportacoes_eventos_variaveis"."sequencia" is not null;--> statement-breakpoint
ALTER TABLE "questor_configuracoes" ADD CONSTRAINT "questor_configuracoes_codigo_empresa_check" CHECK ("questor_configuracoes"."codigo_empresa_questor" is null or "questor_configuracoes"."codigo_empresa_questor" between 1 and 999999);--> statement-breakpoint
ALTER TABLE "questor_configuracoes" ADD CONSTRAINT "questor_configuracoes_razao_social_check" CHECK ("questor_configuracoes"."razao_social_questor" is null or length(btrim("questor_configuracoes"."razao_social_questor")) between 1 and 200);--> statement-breakpoint
ALTER TABLE "questor_eventos_variaveis" ADD CONSTRAINT "questor_eventos_variaveis_natureza_check" CHECK ("questor_eventos_variaveis"."natureza" is null or "questor_eventos_variaveis"."natureza" in ('Provento', 'Desconto'));--> statement-breakpoint
ALTER TABLE "questor_eventos_variaveis" ADD CONSTRAINT "questor_eventos_variaveis_catalogo_check" CHECK (("questor_eventos_variaveis"."sequencia_questor" is null or "questor_eventos_variaveis"."sequencia_questor" > 0) and ("questor_eventos_variaveis"."filial_questor" is null or "questor_eventos_variaveis"."filial_questor" > 0));--> statement-breakpoint
ALTER TABLE "questor_eventos_variaveis_lancamentos" ADD CONSTRAINT "questor_eventos_variaveis_lancamentos_cancelamento_check" CHECK (("questor_eventos_variaveis_lancamentos"."cancelado_em" is null and "questor_eventos_variaveis_lancamentos"."cancelado_por" is null and "questor_eventos_variaveis_lancamentos"."motivo_cancelamento" is null) or ("questor_eventos_variaveis_lancamentos"."cancelado_em" is not null and "questor_eventos_variaveis_lancamentos"."cancelado_por" is not null and length(btrim("questor_eventos_variaveis_lancamentos"."motivo_cancelamento")) between 5 and 500));--> statement-breakpoint
ALTER TABLE "questor_exportacoes" ADD CONSTRAINT "questor_exportacoes_periodo_check" CHECK ("questor_exportacoes"."codigo_periodo_calculo" is null or "questor_exportacoes"."codigo_periodo_calculo" ~ '^[0-9]{1,11}$');--> statement-breakpoint
ALTER TABLE "questor_exportacoes_eventos_variaveis" ADD CONSTRAINT "questor_exportacoes_eventos_linha_check" CHECK (("questor_exportacoes_eventos_variaveis"."sequencia" is null and "questor_exportacoes_eventos_variaveis"."codigo_periodo_calculo" is null and "questor_exportacoes_eventos_variaveis"."codigo_contrato" is null) or ("questor_exportacoes_eventos_variaveis"."sequencia" > 0 and "questor_exportacoes_eventos_variaveis"."codigo_periodo_calculo" ~ '^[0-9]{1,11}$' and "questor_exportacoes_eventos_variaveis"."codigo_contrato" ~ '^[0-9]{1,10}$'));