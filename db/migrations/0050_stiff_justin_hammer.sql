CREATE TABLE "caixa_indisponibilidades" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"fechamento_caixa_id" uuid NOT NULL,
	"motivos" text[] NOT NULL,
	"motivo_outro" text,
	"iniciado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"retornado_em" timestamp with time zone,
	"registrado_por" text NOT NULL,
	"retornado_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "caixa_indisponibilidades_motivos_check" CHECK (cardinality("caixa_indisponibilidades"."motivos") > 0
        and "caixa_indisponibilidades"."motivos" <@ array[
          'falta_energia', 'oscilacao_eletrica', 'internet_caiu', 'cabo_desconectado',
          'computador_travou', 'limpeza_manutencao', 'atualizacao_sistema', 'outro'
        ]::text[]),
	CONSTRAINT "caixa_indisponibilidades_outro_check" CHECK ((('outro' = any("caixa_indisponibilidades"."motivos") and length(btrim(coalesce("caixa_indisponibilidades"."motivo_outro", ''))) > 0)
        or ('outro' <> all("caixa_indisponibilidades"."motivos") and "caixa_indisponibilidades"."motivo_outro" is null))),
	CONSTRAINT "caixa_indisponibilidades_periodo_check" CHECK ("caixa_indisponibilidades"."retornado_em" is null or "caixa_indisponibilidades"."retornado_em" >= "caixa_indisponibilidades"."iniciado_em")
);
--> statement-breakpoint
ALTER TABLE "caixa_indisponibilidades" ADD CONSTRAINT "caixa_indisponibilidades_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caixa_indisponibilidades" ADD CONSTRAINT "caixa_indisponibilidades_registrado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("registrado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caixa_indisponibilidades" ADD CONSTRAINT "caixa_indisponibilidades_retornado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("retornado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caixa_indisponibilidades" ADD CONSTRAINT "caixa_indisponibilidades_caixa_empresa_fk" FOREIGN KEY ("fechamento_caixa_id","empresa_id") REFERENCES "public"."fechamentos_caixa"("id","empresa_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "caixa_indisponibilidades_uma_aberta_por_caixa_idx" ON "caixa_indisponibilidades" USING btree ("fechamento_caixa_id") WHERE "caixa_indisponibilidades"."retornado_em" is null;--> statement-breakpoint
CREATE INDEX "caixa_indisponibilidades_caixa_inicio_idx" ON "caixa_indisponibilidades" USING btree ("fechamento_caixa_id","iniciado_em");