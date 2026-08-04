-- PROJECT_BRAIN/17 §5 (S3): cadastro de patrimonio (D2) + descontos da discriminacao em 3 niveis.
-- Gerada por drizzle-kit; os blocos "backfill" e os SET NOT NULL foram escritos a mao (o gerador
-- nao move dado). Aprovada pelo Jose em 29/07 com as 4 decisoes do plano.
CREATE TABLE "grupos_patrimonio" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"sig" text NOT NULL,
	"nome" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grupos_patrimonio_sig_unica" UNIQUE("empresa_id","sig"),
	CONSTRAINT "grupos_patrimonio_sig_check" CHECK ("grupos_patrimonio"."sig" ~ '^[A-Z]{2,4}$')
);
--> statement-breakpoint
CREATE TABLE "patrimonio_itens" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"grupo_patrimonio_id" uuid NOT NULL,
	"setor_id" uuid,
	"nome" text NOT NULL,
	"marca" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "despesas" ADD COLUMN "desconto_geral_tipo" text;--> statement-breakpoint
ALTER TABLE "despesas" ADD COLUMN "desconto_geral_valor" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "despesas_itens" ADD COLUMN "quantidade" numeric(14, 3) DEFAULT '1' NOT NULL;--> statement-breakpoint
ALTER TABLE "despesas_itens" ADD COLUMN "valor_unitario" numeric(14, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "despesas_itens" ADD COLUMN "desconto_tipo" text;--> statement-breakpoint
ALTER TABLE "despesas_itens" ADD COLUMN "desconto_valor" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "despesas_itens" ADD COLUMN "desconto_total_tipo" text;--> statement-breakpoint
ALTER TABLE "despesas_itens" ADD COLUMN "desconto_total_valor" numeric(14, 4);--> statement-breakpoint
-- backfill (a mao): item de despesa antigo = 1 x valor, sem desconto em nenhum nivel.
UPDATE "despesas_itens" SET "valor_unitario" = "valor" WHERE "valor_unitario" = 0;--> statement-breakpoint
-- expandir -> migrar -> contrair: entra aceitando null, preenche, depois exige.
ALTER TABLE "despesas_itens" ADD COLUMN "valor_unitario_com_desconto" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "despesas_itens" ADD COLUMN "valor_total_com_desconto" numeric(14, 2);--> statement-breakpoint
UPDATE "despesas_itens"
	SET "valor_unitario_com_desconto" = "valor_unitario",
	    "valor_total_com_desconto" = "valor"
	WHERE "valor_total_com_desconto" IS NULL;--> statement-breakpoint
ALTER TABLE "despesas_itens" ALTER COLUMN "valor_unitario_com_desconto" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "despesas_itens" ALTER COLUMN "valor_total_com_desconto" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "mercadorias" ADD COLUMN "desconto_geral_tipo" text;--> statement-breakpoint
ALTER TABLE "mercadorias" ADD COLUMN "desconto_geral_valor" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "mercadorias_itens" ADD COLUMN "desconto_total_tipo" text;--> statement-breakpoint
ALTER TABLE "mercadorias_itens" ADD COLUMN "desconto_total_valor" numeric(14, 4);--> statement-breakpoint
-- backfill (a mao) — PRESERVA o valor do que ja esta gravado: o desconto de item de hoje incide
-- sobre o TOTAL do item (calcularTotalItemMercadoria: bruto - desconto), que e exatamente o nivel
-- novo desconto_total_*. Move para la e libera desconto_* para o nivel V.Unit.
UPDATE "mercadorias_itens"
	SET "desconto_total_tipo" = "desconto_tipo",
	    "desconto_total_valor" = "desconto_valor",
	    "desconto_tipo" = NULL,
	    "desconto_valor" = NULL
	WHERE "desconto_tipo" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "mercadorias_itens" ADD COLUMN "valor_unitario_com_desconto" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "mercadorias_itens" ADD COLUMN "valor_total_com_desconto" numeric(14, 2);--> statement-breakpoint
-- Sem desconto geral no passado: o total com desconto e o proprio valor_total, e o unitario
-- derivado dele (total / quantidade), como manda a regra de fonte da verdade.
UPDATE "mercadorias_itens"
	SET "valor_total_com_desconto" = "valor_total",
	    "valor_unitario_com_desconto" = round("valor_total" / "quantidade", 4)
	WHERE "valor_total_com_desconto" IS NULL;--> statement-breakpoint
ALTER TABLE "mercadorias_itens" ALTER COLUMN "valor_unitario_com_desconto" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "mercadorias_itens" ALTER COLUMN "valor_total_com_desconto" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "grupos_patrimonio" ADD CONSTRAINT "grupos_patrimonio_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patrimonio_itens" ADD CONSTRAINT "patrimonio_itens_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patrimonio_itens" ADD CONSTRAINT "patrimonio_itens_grupo_patrimonio_id_grupos_patrimonio_id_fk" FOREIGN KEY ("grupo_patrimonio_id") REFERENCES "public"."grupos_patrimonio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patrimonio_itens" ADD CONSTRAINT "patrimonio_itens_setor_id_setores_id_fk" FOREIGN KEY ("setor_id") REFERENCES "public"."setores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "patrimonio_itens_empresa_idx" ON "patrimonio_itens" USING btree ("empresa_id");--> statement-breakpoint
CREATE INDEX "patrimonio_itens_grupo_idx" ON "patrimonio_itens" USING btree ("grupo_patrimonio_id");--> statement-breakpoint
ALTER TABLE "despesas" ADD CONSTRAINT "despesas_desconto_geral_tipo_check" CHECK ("despesas"."desconto_geral_tipo" is null or "despesas"."desconto_geral_tipo" in ('percentual', 'valor'));--> statement-breakpoint
ALTER TABLE "despesas" ADD CONSTRAINT "despesas_desconto_geral_valor_check" CHECK ("despesas"."desconto_geral_valor" is null or "despesas"."desconto_geral_valor" >= 0);--> statement-breakpoint
ALTER TABLE "despesas_itens" ADD CONSTRAINT "despesas_itens_quantidade_check" CHECK ("despesas_itens"."quantidade" > 0);--> statement-breakpoint
ALTER TABLE "despesas_itens" ADD CONSTRAINT "despesas_itens_valor_unitario_check" CHECK ("despesas_itens"."valor_unitario" >= 0);--> statement-breakpoint
ALTER TABLE "despesas_itens" ADD CONSTRAINT "despesas_itens_desconto_tipo_check" CHECK ("despesas_itens"."desconto_tipo" is null or "despesas_itens"."desconto_tipo" in ('percentual', 'valor'));--> statement-breakpoint
ALTER TABLE "despesas_itens" ADD CONSTRAINT "despesas_itens_desconto_valor_check" CHECK ("despesas_itens"."desconto_valor" is null or "despesas_itens"."desconto_valor" >= 0);--> statement-breakpoint
ALTER TABLE "despesas_itens" ADD CONSTRAINT "despesas_itens_desconto_total_tipo_check" CHECK ("despesas_itens"."desconto_total_tipo" is null or "despesas_itens"."desconto_total_tipo" in ('percentual', 'valor'));--> statement-breakpoint
ALTER TABLE "despesas_itens" ADD CONSTRAINT "despesas_itens_desconto_total_valor_check" CHECK ("despesas_itens"."desconto_total_valor" is null or "despesas_itens"."desconto_total_valor" >= 0);--> statement-breakpoint
ALTER TABLE "despesas_itens" ADD CONSTRAINT "despesas_itens_valor_com_desconto_check" CHECK ("despesas_itens"."valor_total_com_desconto" >= 0 and "despesas_itens"."valor_unitario_com_desconto" >= 0);--> statement-breakpoint
ALTER TABLE "mercadorias" ADD CONSTRAINT "mercadorias_desconto_geral_tipo_check" CHECK ("mercadorias"."desconto_geral_tipo" is null or "mercadorias"."desconto_geral_tipo" in ('percentual', 'valor'));--> statement-breakpoint
ALTER TABLE "mercadorias" ADD CONSTRAINT "mercadorias_desconto_geral_valor_check" CHECK ("mercadorias"."desconto_geral_valor" is null or "mercadorias"."desconto_geral_valor" >= 0);--> statement-breakpoint
ALTER TABLE "mercadorias_itens" ADD CONSTRAINT "mercadorias_itens_desconto_total_tipo_check" CHECK ("mercadorias_itens"."desconto_total_tipo" is null or "mercadorias_itens"."desconto_total_tipo" in ('percentual', 'valor'));--> statement-breakpoint
ALTER TABLE "mercadorias_itens" ADD CONSTRAINT "mercadorias_itens_desconto_total_valor_check" CHECK ("mercadorias_itens"."desconto_total_valor" is null or "mercadorias_itens"."desconto_total_valor" >= 0);--> statement-breakpoint
ALTER TABLE "mercadorias_itens" ADD CONSTRAINT "mercadorias_itens_valor_com_desconto_check" CHECK ("mercadorias_itens"."valor_total_com_desconto" >= 0 and "mercadorias_itens"."valor_unitario_com_desconto" >= 0);
