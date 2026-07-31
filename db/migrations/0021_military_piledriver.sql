CREATE TABLE "maquininhas" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"numero_serie" text NOT NULL,
	"apelido" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quebras_caixa" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"fechamento_caixa_id" uuid NOT NULL,
	"usuario_id" text NOT NULL,
	"valor" numeric(14, 2) NOT NULL,
	"observacao" text NOT NULL,
	"verificado" boolean DEFAULT false NOT NULL,
	"verificado_por" text,
	"verificado_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quebras_caixa_fechamento_unico" UNIQUE("fechamento_caixa_id"),
	CONSTRAINT "quebras_caixa_valor_nao_zero_check" CHECK ("quebras_caixa"."valor" <> 0),
	CONSTRAINT "quebras_caixa_observacao_nao_vazia_check" CHECK (length(btrim("quebras_caixa"."observacao")) > 0),
	CONSTRAINT "quebras_caixa_verificacao_consistente_check" CHECK (("quebras_caixa"."verificado" = false and "quebras_caixa"."verificado_por" is null and "quebras_caixa"."verificado_em" is null)
        or ("quebras_caixa"."verificado" = true and "quebras_caixa"."verificado_por" is not null and "quebras_caixa"."verificado_em" is not null))
);
--> statement-breakpoint
ALTER TABLE "fechamentos_caixa" ADD COLUMN "maquininha_id" uuid;--> statement-breakpoint
ALTER TABLE "maquininhas" ADD CONSTRAINT "maquininhas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quebras_caixa" ADD CONSTRAINT "quebras_caixa_fechamento_caixa_id_fechamentos_caixa_id_fk" FOREIGN KEY ("fechamento_caixa_id") REFERENCES "public"."fechamentos_caixa"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quebras_caixa" ADD CONSTRAINT "quebras_caixa_usuario_id_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quebras_caixa" ADD CONSTRAINT "quebras_caixa_verificado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("verificado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "maquininhas_empresa_numero_serie_unico_idx" ON "maquininhas" USING btree ("empresa_id",lower("numero_serie"));--> statement-breakpoint
CREATE INDEX "maquininhas_empresa_ativo_idx" ON "maquininhas" USING btree ("empresa_id","ativo");--> statement-breakpoint
CREATE INDEX "quebras_caixa_usuario_pendente_idx" ON "quebras_caixa" USING btree ("usuario_id","verificado");--> statement-breakpoint
ALTER TABLE "fechamentos_caixa" ADD CONSTRAINT "fechamentos_caixa_maquininha_id_maquininhas_id_fk" FOREIGN KEY ("maquininha_id") REFERENCES "public"."maquininhas"("id") ON DELETE set null ON UPDATE no action;