CREATE TABLE "fechamentos_caixa_anexos" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"fechamento_caixa_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"caminho" text NOT NULL,
	"nome_original" text NOT NULL,
	"nome_arquivo" text NOT NULL,
	"mime_type" text NOT NULL,
	"tamanho_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"ia_status" text DEFAULT 'desativada' NOT NULL,
	"ia_resultado" jsonb,
	"ia_erro" text,
	"ia_analisado_em" timestamp with time zone,
	"criado_por" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fechamentos_caixa_anexos_tipo_check" CHECK ("fechamentos_caixa_anexos"."tipo" in ('folha_fechamento', 'comprovante_cartao')),
	CONSTRAINT "fechamentos_caixa_anexos_tamanho_check" CHECK ("fechamentos_caixa_anexos"."tamanho_bytes" > 0),
	CONSTRAINT "fechamentos_caixa_anexos_ia_status_check" CHECK ("fechamentos_caixa_anexos"."ia_status" in ('desativada', 'pendente', 'processando', 'concluida', 'falhou'))
);
--> statement-breakpoint
CREATE TABLE "transferencias_conferencias_fisicas" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"transferencia_id" uuid NOT NULL,
	"fechamento_caixa_id" uuid NOT NULL,
	"etapa" text NOT NULL,
	"resultado" text NOT NULL,
	"encerra_conferencia" boolean DEFAULT false NOT NULL,
	"valor_especie_declarado" numeric(14, 2) NOT NULL,
	"valor_moedas_declarado" numeric(14, 2) NOT NULL,
	"valor_especie_contado" numeric(14, 2) NOT NULL,
	"valor_moedas_contado" numeric(14, 2) NOT NULL,
	"observacao" text,
	"conferido_por" text NOT NULL,
	"conferido_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transferencias_conferencias_fisicas_etapa_check" CHECK ("transferencias_conferencias_fisicas"."etapa" in ('abertura', 'retorno_sangria')),
	CONSTRAINT "transferencias_conferencias_fisicas_resultado_check" CHECK ("transferencias_conferencias_fisicas"."resultado" in ('convergente', 'divergente')),
	CONSTRAINT "transferencias_conferencias_fisicas_valores_check" CHECK ("transferencias_conferencias_fisicas"."valor_especie_declarado" >= 0 and "transferencias_conferencias_fisicas"."valor_moedas_declarado" >= 0
        and "transferencias_conferencias_fisicas"."valor_especie_contado" >= 0 and "transferencias_conferencias_fisicas"."valor_moedas_contado" >= 0),
	CONSTRAINT "transferencias_conferencias_fisicas_resultado_observacao_check" CHECK (("transferencias_conferencias_fisicas"."resultado" = 'convergente'
            and "transferencias_conferencias_fisicas"."valor_especie_declarado" = "transferencias_conferencias_fisicas"."valor_especie_contado"
            and "transferencias_conferencias_fisicas"."valor_moedas_declarado" = "transferencias_conferencias_fisicas"."valor_moedas_contado"
            and "transferencias_conferencias_fisicas"."observacao" is null)
        or ("transferencias_conferencias_fisicas"."resultado" = 'divergente'
            and ("transferencias_conferencias_fisicas"."valor_especie_declarado" <> "transferencias_conferencias_fisicas"."valor_especie_contado"
              or "transferencias_conferencias_fisicas"."valor_moedas_declarado" <> "transferencias_conferencias_fisicas"."valor_moedas_contado")
            and "transferencias_conferencias_fisicas"."observacao" is not null
            and length(btrim("transferencias_conferencias_fisicas"."observacao")) > 0))
);
--> statement-breakpoint
ALTER TABLE "transferencias" DROP CONSTRAINT "transferencias_valor_recebido_check";--> statement-breakpoint
ALTER TABLE "fechamentos_caixa" ADD COLUMN "valor_fisico_esperado_fechamento" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "fechamentos_caixa" ADD COLUMN "valor_especie_fechamento" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "fechamentos_caixa" ADD COLUMN "valor_moedas_fechamento" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "transferencias" ADD COLUMN "valor_especie_declarado" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "transferencias" ADD COLUMN "valor_moedas_declarado" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "fechamentos_caixa_anexos" ADD CONSTRAINT "fechamentos_caixa_anexos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fechamentos_caixa_anexos" ADD CONSTRAINT "fechamentos_caixa_anexos_criado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fechamentos_caixa_anexos" ADD CONSTRAINT "fechamentos_caixa_anexos_fechamento_empresa_fk" FOREIGN KEY ("fechamento_caixa_id","empresa_id") REFERENCES "public"."fechamentos_caixa"("id","empresa_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferencias_conferencias_fisicas" ADD CONSTRAINT "transferencias_conferencias_fisicas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferencias_conferencias_fisicas" ADD CONSTRAINT "transferencias_conferencias_fisicas_conferido_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("conferido_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferencias_conferencias_fisicas" ADD CONSTRAINT "transferencias_conferencias_fisicas_transferencia_empresa_fk" FOREIGN KEY ("transferencia_id","empresa_id") REFERENCES "public"."transferencias"("id","empresa_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferencias_conferencias_fisicas" ADD CONSTRAINT "transferencias_conferencias_fisicas_fechamento_empresa_fk" FOREIGN KEY ("fechamento_caixa_id","empresa_id") REFERENCES "public"."fechamentos_caixa"("id","empresa_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fechamentos_caixa_anexos_fechamento_tipo_idx" ON "fechamentos_caixa_anexos" USING btree ("fechamento_caixa_id","tipo","criado_em");--> statement-breakpoint
CREATE UNIQUE INDEX "transferencias_conferencias_fisicas_desfecho_unico" ON "transferencias_conferencias_fisicas" USING btree ("transferencia_id") WHERE "transferencias_conferencias_fisicas"."encerra_conferencia";--> statement-breakpoint
CREATE INDEX "transferencias_conferencias_fisicas_transferencia_idx" ON "transferencias_conferencias_fisicas" USING btree ("transferencia_id","conferido_em");--> statement-breakpoint
ALTER TABLE "fechamentos_caixa" ADD CONSTRAINT "fechamentos_caixa_composicao_fechamento_check" CHECK (("fechamentos_caixa"."valor_fisico_esperado_fechamento" is null
            and "fechamentos_caixa"."valor_especie_fechamento" is null
            and "fechamentos_caixa"."valor_moedas_fechamento" is null)
        or ("fechamentos_caixa"."valor_fisico_esperado_fechamento" >= 0
            and "fechamentos_caixa"."valor_especie_fechamento" >= 0
            and "fechamentos_caixa"."valor_moedas_fechamento" >= 0));--> statement-breakpoint
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_composicao_declarada_check" CHECK (("transferencias"."valor_especie_declarado" is null and "transferencias"."valor_moedas_declarado" is null)
        or ("transferencias"."valor_especie_declarado" >= 0
            and "transferencias"."valor_moedas_declarado" >= 0
            and "transferencias"."valor_especie_declarado" + "transferencias"."valor_moedas_declarado" = "transferencias"."valor_original"));--> statement-breakpoint
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_valor_recebido_check" CHECK (("transferencias"."status" = 'divergente'
             and "transferencias"."valor_recebido" is not null
             and "transferencias"."valor_recebido" >= 0)
        or ("transferencias"."status" = 'recebido' and "transferencias"."tipo" = 'abertura'
            and ("transferencias"."valor_recebido" is null or "transferencias"."valor_recebido" >= 0))
        or ("transferencias"."status" <> 'divergente'
            and not ("transferencias"."status" = 'recebido' and "transferencias"."tipo" = 'abertura')
            and "transferencias"."valor_recebido" is null));