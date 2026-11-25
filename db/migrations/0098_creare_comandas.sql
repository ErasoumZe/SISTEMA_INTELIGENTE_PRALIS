CREATE TABLE "creare_comanda_itens" (
	"empresa_id" uuid NOT NULL,
	"id_item" bigint NOT NULL,
	"id_comanda" bigint NOT NULL,
	"produto_codigo" text,
	"descricao" text NOT NULL,
	"quantidade" numeric(14, 3) NOT NULL,
	"valor_total" numeric(14, 2) NOT NULL,
	"funcionario_codigo" text,
	"funcionario_nome" text,
	"cancelado" boolean DEFAULT false NOT NULL,
	"motivo_cancelamento" text,
	"lancado_em" timestamp with time zone,
	CONSTRAINT "creare_comanda_itens_empresa_id_id_item_pk" PRIMARY KEY("empresa_id","id_item")
);
--> statement-breakpoint
CREATE TABLE "creare_comandas" (
	"empresa_id" uuid NOT NULL,
	"id_comanda" bigint NOT NULL,
	"numero" integer NOT NULL,
	"mesa" integer,
	"status" smallint NOT NULL,
	"aberta_em" timestamp with time zone,
	"ultimo_lancamento_em" timestamp with time zone,
	"puxada_em" timestamp with time zone,
	"fechada_em" timestamp with time zone,
	"valor_subtotal" numeric(14, 2) DEFAULT '0' NOT NULL,
	"valor_desconto" numeric(14, 2) DEFAULT '0' NOT NULL,
	"valor_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"nome_cliente" text,
	"observacao" text,
	"venda_creare_id" bigint,
	"venda_valor_total" numeric(14, 2),
	"conteudo_hash" text NOT NULL,
	"atualizada_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creare_comandas_empresa_id_id_comanda_pk" PRIMARY KEY("empresa_id","id_comanda")
);
--> statement-breakpoint
CREATE TABLE "creare_comandas_retrato" (
	"empresa_id" uuid PRIMARY KEY NOT NULL,
	"recebido_em" timestamp with time zone DEFAULT now() NOT NULL,
	"abertas" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "creare_comanda_itens" ADD CONSTRAINT "creare_comanda_itens_comanda_fk" FOREIGN KEY ("empresa_id","id_comanda") REFERENCES "public"."creare_comandas"("empresa_id","id_comanda") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creare_comandas" ADD CONSTRAINT "creare_comandas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creare_comandas_retrato" ADD CONSTRAINT "creare_comandas_retrato_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "creare_comanda_itens_comanda_idx" ON "creare_comanda_itens" USING btree ("empresa_id","id_comanda");--> statement-breakpoint
CREATE INDEX "creare_comanda_itens_funcionario_idx" ON "creare_comanda_itens" USING btree ("empresa_id","funcionario_codigo");--> statement-breakpoint
CREATE INDEX "creare_comandas_status_idx" ON "creare_comandas" USING btree ("empresa_id","status");--> statement-breakpoint
CREATE INDEX "creare_comandas_fechada_idx" ON "creare_comandas" USING btree ("empresa_id","fechada_em");--> statement-breakpoint
CREATE INDEX "creare_comandas_numero_idx" ON "creare_comandas" USING btree ("empresa_id","numero");