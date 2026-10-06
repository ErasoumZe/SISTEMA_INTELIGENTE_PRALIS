CREATE TABLE "fechamentos_caixa_relatorios_vendas" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"fechamento_caixa_id" uuid NOT NULL,
	"periodo_inicio" timestamp with time zone NOT NULL,
	"periodo_fim" timestamp with time zone NOT NULL,
	"dados" jsonb NOT NULL,
	"gerado_por" text NOT NULL,
	"gerado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fechamentos_caixa_relatorios_vendas_fechamento_unico" UNIQUE("fechamento_caixa_id")
);
--> statement-breakpoint
ALTER TABLE "fechamentos_caixa_relatorios_maquininha" ADD COLUMN "versao" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "fechamentos_caixa_relatorios_maquininha" ADD COLUMN "numero_maquininha" text;--> statement-breakpoint
ALTER TABLE "fechamentos_caixa_relatorios_maquininha" ADD COLUMN "credito_inicial" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "fechamentos_caixa_relatorios_maquininha" ADD COLUMN "debito_inicial" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "fechamentos_caixa_relatorios_maquininha" ADD COLUMN "pix_inicial" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "fechamentos_caixa_relatorios_maquininha" ADD COLUMN "voucher_inicial" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "fechamentos_caixa_relatorios_maquininha" ADD COLUMN "credito_final" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "fechamentos_caixa_relatorios_maquininha" ADD COLUMN "debito_final" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "fechamentos_caixa_relatorios_maquininha" ADD COLUMN "pix_final" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "fechamentos_caixa_relatorios_maquininha" ADD COLUMN "voucher_final" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "fechamentos_caixa_relatorios_maquininha" ADD COLUMN "anexo_inicial_id" uuid;--> statement-breakpoint
ALTER TABLE "fechamentos_caixa_relatorios_maquininha" ADD COLUMN "anexo_final_id" uuid;--> statement-breakpoint
ALTER TABLE "formas_pagamento" ADD COLUMN "categoria_fechamento_caixa" text DEFAULT 'outros' NOT NULL;--> statement-breakpoint
ALTER TABLE "fechamentos_caixa_relatorios_vendas" ADD CONSTRAINT "fechamentos_caixa_relatorios_vendas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fechamentos_caixa_relatorios_vendas" ADD CONSTRAINT "fechamentos_caixa_relatorios_vendas_gerado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("gerado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fechamentos_caixa_relatorios_vendas" ADD CONSTRAINT "fechamentos_caixa_relatorios_vendas_fechamento_empresa_fk" FOREIGN KEY ("fechamento_caixa_id","empresa_id") REFERENCES "public"."fechamentos_caixa"("id","empresa_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fechamentos_caixa_relatorios_vendas_empresa_idx" ON "fechamentos_caixa_relatorios_vendas" USING btree ("empresa_id","gerado_em");--> statement-breakpoint
ALTER TABLE "fechamentos_caixa_relatorios_maquininha" ADD CONSTRAINT "fechamentos_caixa_relatorios_maquininha_anexo_inicial_id_fechamentos_caixa_anexos_id_fk" FOREIGN KEY ("anexo_inicial_id") REFERENCES "public"."fechamentos_caixa_anexos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fechamentos_caixa_relatorios_maquininha" ADD CONSTRAINT "fechamentos_caixa_relatorios_maquininha_anexo_final_id_fechamentos_caixa_anexos_id_fk" FOREIGN KEY ("anexo_final_id") REFERENCES "public"."fechamentos_caixa_anexos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formas_pagamento" ADD CONSTRAINT "formas_pagamento_categoria_fechamento_caixa_check" CHECK ("formas_pagamento"."categoria_fechamento_caixa" in ('dinheiro', 'credito', 'debito', 'pix', 'voucher', 'crediario', 'outros'));