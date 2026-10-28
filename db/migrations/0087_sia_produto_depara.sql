CREATE TABLE "sia_produto_depara" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"codigo_barras" text NOT NULL,
	"chave_barras" text NOT NULL,
	"coditem" text NOT NULL,
	"descricao" text DEFAULT '' NOT NULL,
	"cod_grupo" text DEFAULT '' NOT NULL,
	"aliq_saida_ecf" text DEFAULT '' NOT NULL,
	"reducao" numeric(7, 4),
	"aliquota_interna" numeric(7, 4),
	"cst_saida" text DEFAULT '' NOT NULL,
	"csosn" text DEFAULT '' NOT NULL,
	"ncm" text DEFAULT '' NOT NULL,
	"ativo" text DEFAULT '' NOT NULL,
	"pesavel" text,
	"tecla_balanca" text,
	"validade_balanca" text,
	"importado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sia_produto_depara" ADD CONSTRAINT "sia_produto_depara_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sia_produto_depara_barras_uidx" ON "sia_produto_depara" USING btree ("empresa_id","chave_barras");--> statement-breakpoint
CREATE UNIQUE INDEX "sia_produto_depara_coditem_uidx" ON "sia_produto_depara" USING btree ("empresa_id","coditem");