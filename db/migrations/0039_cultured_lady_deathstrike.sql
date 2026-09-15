CREATE TABLE "regras_recebimento" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"forma_pagamento_id" uuid NOT NULL,
	"parcelas_de" integer,
	"parcelas_ate" integer,
	"taxa_percentual" numeric(8, 4),
	"taxa_fixa" numeric(14, 2),
	"prazo_dias" integer,
	"status" text DEFAULT 'rascunho' NOT NULL,
	"fonte_referencia" text,
	"observacao" text,
	"vigencia_inicio" date,
	"vigencia_fim" date,
	"criado_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "regras_recebimento_status_check" CHECK ("regras_recebimento"."status" in ('rascunho', 'validada', 'arquivada')),
	CONSTRAINT "regras_recebimento_parcelas_check" CHECK (("regras_recebimento"."parcelas_de" is null and "regras_recebimento"."parcelas_ate" is null)
       or ("regras_recebimento"."parcelas_de" is not null and "regras_recebimento"."parcelas_ate" is not null
           and "regras_recebimento"."parcelas_de" >= 1 and "regras_recebimento"."parcelas_ate" >= "regras_recebimento"."parcelas_de")),
	CONSTRAINT "regras_recebimento_taxa_percentual_check" CHECK ("regras_recebimento"."taxa_percentual" is null or ("regras_recebimento"."taxa_percentual" >= 0 and "regras_recebimento"."taxa_percentual" <= 100)),
	CONSTRAINT "regras_recebimento_taxa_fixa_check" CHECK ("regras_recebimento"."taxa_fixa" is null or "regras_recebimento"."taxa_fixa" >= 0),
	CONSTRAINT "regras_recebimento_prazo_dias_check" CHECK ("regras_recebimento"."prazo_dias" is null or "regras_recebimento"."prazo_dias" >= 0),
	CONSTRAINT "regras_recebimento_vigencia_check" CHECK ("regras_recebimento"."vigencia_inicio" is null or "regras_recebimento"."vigencia_fim" is null or "regras_recebimento"."vigencia_fim" >= "regras_recebimento"."vigencia_inicio")
);
--> statement-breakpoint
ALTER TABLE "formas_pagamento" ADD CONSTRAINT "formas_pagamento_id_empresa_unica" UNIQUE("id","empresa_id");
--> statement-breakpoint
ALTER TABLE "regras_recebimento" ADD CONSTRAINT "regras_recebimento_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_recebimento" ADD CONSTRAINT "regras_recebimento_criado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_recebimento" ADD CONSTRAINT "regras_recebimento_forma_empresa_fk" FOREIGN KEY ("forma_pagamento_id","empresa_id") REFERENCES "public"."formas_pagamento"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "regras_recebimento_empresa_forma_status_idx" ON "regras_recebimento" USING btree ("empresa_id","forma_pagamento_id","status");--> statement-breakpoint
