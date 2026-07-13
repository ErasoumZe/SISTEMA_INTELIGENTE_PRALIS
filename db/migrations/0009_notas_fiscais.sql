CREATE TABLE "notas_fiscais" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"chave" text NOT NULL,
	"numero" text,
	"serie" text,
	"modelo" text,
	"natureza_operacao" text,
	"data_emissao" timestamp with time zone,
	"fornecedor_cnpj" text,
	"fornecedor_nome" text,
	"fornecedor_id" uuid,
	"valor_produtos" numeric(14, 2),
	"valor_desconto" numeric(14, 2),
	"valor_frete" numeric(14, 2),
	"valor_outros" numeric(14, 2),
	"valor_seguro" numeric(14, 2),
	"valor_total" numeric(14, 2),
	"data_vencimento" date,
	"mercadoria_id" uuid,
	"payload_hash" text,
	"status_importacao" text DEFAULT 'pendente_revisao' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notas_fiscais_empresa_chave_unica" UNIQUE("empresa_id","chave"),
	CONSTRAINT "notas_fiscais_status_importacao_check" CHECK ("notas_fiscais"."status_importacao" in ('pendente_revisao', 'revisada', 'ignorada', 'cancelada'))
);
--> statement-breakpoint
CREATE TABLE "notas_fiscais_itens" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"nota_fiscal_id" uuid NOT NULL,
	"numero_item" integer,
	"ean" text,
	"ncm" text,
	"cfop" text,
	"cest" text,
	"descricao" text,
	"unidade_comercial" text,
	"quantidade" numeric(14, 4),
	"valor_unitario" numeric(14, 6),
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notas_fiscais" ADD CONSTRAINT "notas_fiscais_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notas_fiscais" ADD CONSTRAINT "notas_fiscais_fornecedor_id_fornecedores_id_fk" FOREIGN KEY ("fornecedor_id") REFERENCES "public"."fornecedores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notas_fiscais" ADD CONSTRAINT "notas_fiscais_mercadoria_id_mercadorias_id_fk" FOREIGN KEY ("mercadoria_id") REFERENCES "public"."mercadorias"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notas_fiscais_itens" ADD CONSTRAINT "notas_fiscais_itens_nota_fiscal_id_notas_fiscais_id_fk" FOREIGN KEY ("nota_fiscal_id") REFERENCES "public"."notas_fiscais"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notas_fiscais_empresa_status_idx" ON "notas_fiscais" USING btree ("empresa_id","status_importacao");--> statement-breakpoint
CREATE INDEX "notas_fiscais_itens_nota_idx" ON "notas_fiscais_itens" USING btree ("nota_fiscal_id");