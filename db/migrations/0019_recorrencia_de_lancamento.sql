-- PROJECT_BRAIN/17 D3 (S5): recorrencia de lancamento. Guarda a DEFINICAO da serie e liga cada
-- lancamento gerado a ela (recorrencia_id + recorrencia_ordem, que a tela mostra como "3/12").
-- Gerada por drizzle-kit, sem edicao a mao.
--
-- ADITIVA e sem backfill: as tres colunas de vinculo entram nulas em todo o historico, e nulo e o
-- estado correto — lancamento antigo nao veio de serie nenhuma. Por isso o par e "os dois nulos OU
-- os dois preenchidos" (num_nonnulls <> 1) e nao "exatamente um", o mesmo raciocinio da 0017.
--
-- dias_semana aceita NULL: o CHECK com regex nao rejeita nulo (NULL ~ padrao = NULL = passa), e e
-- justamente fora da frequencia 'semana' que ele deve ficar vazio.
--
-- FK das tres SEM "on delete": apagar uma recorrencia que tem lancamentos passa a ser impedido pelo
-- banco. E o certo — a definicao e o registro de PROVENIENCIA da serie; se ela sumisse, os
-- lancamentos virariam orfaos indistinguiveis de digitacao avulsa.
CREATE TABLE "lancamentos_recorrencias" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"dominio" text NOT NULL,
	"frequencia" text NOT NULL,
	"dias_semana" text,
	"repeticoes" integer NOT NULL,
	"data_inicial" date NOT NULL,
	"criado_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lancamentos_recorrencias_dominio_check" CHECK ("lancamentos_recorrencias"."dominio" in ('despesa', 'mercadoria', 'retirada')),
	CONSTRAINT "lancamentos_recorrencias_frequencia_check" CHECK ("lancamentos_recorrencias"."frequencia" in ('dia', 'semana', 'quinzena', 'mes', 'trimestre')),
	CONSTRAINT "lancamentos_recorrencias_repeticoes_check" CHECK ("lancamentos_recorrencias"."repeticoes" between 1 and 366),
	CONSTRAINT "lancamentos_recorrencias_dias_semana_check" CHECK ("lancamentos_recorrencias"."dias_semana" ~ '^[1-7](,[1-7])*$')
);
--> statement-breakpoint
ALTER TABLE "despesas" ADD COLUMN "recorrencia_id" uuid;--> statement-breakpoint
ALTER TABLE "despesas" ADD COLUMN "recorrencia_ordem" integer;--> statement-breakpoint
ALTER TABLE "mercadorias" ADD COLUMN "recorrencia_id" uuid;--> statement-breakpoint
ALTER TABLE "mercadorias" ADD COLUMN "recorrencia_ordem" integer;--> statement-breakpoint
ALTER TABLE "retiradas" ADD COLUMN "recorrencia_id" uuid;--> statement-breakpoint
ALTER TABLE "retiradas" ADD COLUMN "recorrencia_ordem" integer;--> statement-breakpoint
ALTER TABLE "lancamentos_recorrencias" ADD CONSTRAINT "lancamentos_recorrencias_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lancamentos_recorrencias_empresa_idx" ON "lancamentos_recorrencias" USING btree ("empresa_id");--> statement-breakpoint
ALTER TABLE "despesas" ADD CONSTRAINT "despesas_recorrencia_id_lancamentos_recorrencias_id_fk" FOREIGN KEY ("recorrencia_id") REFERENCES "public"."lancamentos_recorrencias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mercadorias" ADD CONSTRAINT "mercadorias_recorrencia_id_lancamentos_recorrencias_id_fk" FOREIGN KEY ("recorrencia_id") REFERENCES "public"."lancamentos_recorrencias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retiradas" ADD CONSTRAINT "retiradas_recorrencia_id_lancamentos_recorrencias_id_fk" FOREIGN KEY ("recorrencia_id") REFERENCES "public"."lancamentos_recorrencias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "despesas_recorrencia_idx" ON "despesas" USING btree ("recorrencia_id") WHERE "despesas"."recorrencia_id" is not null;--> statement-breakpoint
CREATE INDEX "mercadorias_recorrencia_idx" ON "mercadorias" USING btree ("recorrencia_id") WHERE "mercadorias"."recorrencia_id" is not null;--> statement-breakpoint
CREATE INDEX "retiradas_recorrencia_idx" ON "retiradas" USING btree ("recorrencia_id") WHERE "retiradas"."recorrencia_id" is not null;--> statement-breakpoint
ALTER TABLE "despesas" ADD CONSTRAINT "despesas_recorrencia_par_check" CHECK (num_nonnulls("despesas"."recorrencia_id", "despesas"."recorrencia_ordem") <> 1);--> statement-breakpoint
ALTER TABLE "despesas" ADD CONSTRAINT "despesas_recorrencia_ordem_check" CHECK ("despesas"."recorrencia_ordem" is null or "despesas"."recorrencia_ordem" >= 1);--> statement-breakpoint
ALTER TABLE "mercadorias" ADD CONSTRAINT "mercadorias_recorrencia_par_check" CHECK (num_nonnulls("mercadorias"."recorrencia_id", "mercadorias"."recorrencia_ordem") <> 1);--> statement-breakpoint
ALTER TABLE "mercadorias" ADD CONSTRAINT "mercadorias_recorrencia_ordem_check" CHECK ("mercadorias"."recorrencia_ordem" is null or "mercadorias"."recorrencia_ordem" >= 1);--> statement-breakpoint
ALTER TABLE "retiradas" ADD CONSTRAINT "retiradas_recorrencia_par_check" CHECK (num_nonnulls("retiradas"."recorrencia_id", "retiradas"."recorrencia_ordem") <> 1);--> statement-breakpoint
ALTER TABLE "retiradas" ADD CONSTRAINT "retiradas_recorrencia_ordem_check" CHECK ("retiradas"."recorrencia_ordem" is null or "retiradas"."recorrencia_ordem" >= 1);