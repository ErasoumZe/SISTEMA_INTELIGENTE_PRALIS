ALTER TABLE "produtos" ADD COLUMN "compra_aproximada" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "produtos" ADD COLUMN "habilitar_ajuda" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "produtos" ADD COLUMN "setor_venda_1" text;--> statement-breakpoint
ALTER TABLE "produtos" ADD COLUMN "setor_venda_2" text;--> statement-breakpoint
ALTER TABLE "produtos_fiscal" ADD COLUMN "tributacao_simples" text;--> statement-breakpoint
ALTER TABLE "produtos_fiscal" ADD COLUMN "aliquota_simples" numeric(8, 6);--> statement-breakpoint
ALTER TABLE "produtos_fiscal" ADD COLUMN "icms_re" numeric(8, 6);--> statement-breakpoint
ALTER TABLE "produtos_fiscal" ADD COLUMN "base_fiscal" text;--> statement-breakpoint
ALTER TABLE "produtos_fiscal" ADD COLUMN "codigo_fiscal" text;--> statement-breakpoint
ALTER TABLE "produtos_fiscal" ADD COLUMN "produto_fiscal" text;--> statement-breakpoint
ALTER TABLE "produtos_fiscal" ADD COLUMN "cst_reforma" text;--> statement-breakpoint
ALTER TABLE "produtos_fiscal" ADD COLUMN "cclass_trib" text;--> statement-breakpoint
ALTER TABLE "produtos_fiscal" ADD COLUMN "aliquota_ibs" numeric(8, 6);--> statement-breakpoint
ALTER TABLE "produtos_fiscal" ADD COLUMN "aliquota_cbs" numeric(8, 6);--> statement-breakpoint
ALTER TABLE "produtos_fiscal" ADD COLUMN "origem_fiscal" text;--> statement-breakpoint
ALTER TABLE "produtos_fiscal" ADD COLUMN "aliquota_ecf" text;--> statement-breakpoint
ALTER TABLE "produtos_fiscal" ADD COLUMN "aliquota_ecf_id" text;--> statement-breakpoint
ALTER TABLE "produtos_fiscal" ADD COLUMN "estado" text;--> statement-breakpoint
ALTER TABLE "produtos_fiscal" ADD COLUMN "motivo" text;--> statement-breakpoint
ALTER TABLE "produtos_fiscal" ADD COLUMN "conferido_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "produtos_fiscal" ADD COLUMN "pct_ncm" numeric(6, 4);--> statement-breakpoint
ALTER TABLE "produtos_transformacao" ADD COLUMN "ref_receituario" text;