CREATE TABLE "campanhas" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"titulo" text NOT NULL,
	"mensagem" text NOT NULL,
	"inicio" date NOT NULL,
	"fim" date NOT NULL,
	"meta_valor" numeric(14, 2) NOT NULL,
	"bonificacao_tipo" text NOT NULL,
	"bonificacao_valor" numeric(14, 2),
	"bonificacao_texto" text,
	"status" text DEFAULT 'rascunho' NOT NULL,
	"criado_por" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campanhas_id_empresa_unica" UNIQUE("id","empresa_id"),
	CONSTRAINT "campanhas_status_check" CHECK ("campanhas"."status" in ('rascunho', 'ativa', 'encerrada', 'cancelada')),
	CONSTRAINT "campanhas_periodo_check" CHECK ("campanhas"."fim" >= "campanhas"."inicio"),
	CONSTRAINT "campanhas_meta_check" CHECK ("campanhas"."meta_valor" > 0),
	CONSTRAINT "campanhas_titulo_nao_vazio_check" CHECK (length(btrim("campanhas"."titulo")) > 0),
	CONSTRAINT "campanhas_mensagem_nao_vazia_check" CHECK (length(btrim("campanhas"."mensagem")) > 0),
	CONSTRAINT "campanhas_bonificacao_check" CHECK (("campanhas"."bonificacao_tipo" in ('dinheiro', 'percentual') and "campanhas"."bonificacao_valor" is not null
          and "campanhas"."bonificacao_valor" > 0 and "campanhas"."bonificacao_texto" is null)
        or ("campanhas"."bonificacao_tipo" = 'recompensa' and "campanhas"."bonificacao_texto" is not null
          and length(btrim("campanhas"."bonificacao_texto")) > 0 and "campanhas"."bonificacao_valor" is null)),
	CONSTRAINT "campanhas_percentual_ate_cem_check" CHECK ("campanhas"."bonificacao_tipo" <> 'percentual' or "campanhas"."bonificacao_valor" <= 100)
);
--> statement-breakpoint
CREATE TABLE "campanhas_pdvs" (
	"campanha_id" uuid NOT NULL,
	"pdv_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campanhas_pdvs_pk" PRIMARY KEY("campanha_id","pdv_id")
);
--> statement-breakpoint
ALTER TABLE "campanhas" ADD CONSTRAINT "campanhas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campanhas" ADD CONSTRAINT "campanhas_criado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campanhas_pdvs" ADD CONSTRAINT "campanhas_pdvs_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campanhas_pdvs" ADD CONSTRAINT "campanhas_pdvs_campanha_empresa_fk" FOREIGN KEY ("campanha_id","empresa_id") REFERENCES "public"."campanhas"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campanhas_pdvs" ADD CONSTRAINT "campanhas_pdvs_pdv_empresa_fk" FOREIGN KEY ("pdv_id","empresa_id") REFERENCES "public"."pdvs"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campanhas_empresa_status_periodo_idx" ON "campanhas" USING btree ("empresa_id","status","inicio","fim");