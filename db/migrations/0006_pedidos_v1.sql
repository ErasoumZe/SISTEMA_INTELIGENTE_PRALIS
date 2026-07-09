CREATE TABLE "pedidos" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"tipo" text DEFAULT 'manual' NOT NULL,
	"status" text DEFAULT 'rascunho' NOT NULL,
	"data_agendada" timestamp with time zone,
	"recorrencia" text DEFAULT 'nenhuma' NOT NULL,
	"observacao" text,
	"criado_por" text,
	"aprovado_por" text,
	"aprovado_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pedidos_tipo_check" CHECK ("pedidos"."tipo" in ('manual', 'automatico')),
	CONSTRAINT "pedidos_status_check" CHECK ("pedidos"."status" in ('rascunho', 'aprovado', 'cancelado')),
	CONSTRAINT "pedidos_recorrencia_check" CHECK ("pedidos"."recorrencia" in ('nenhuma', 'semanal', 'quinzenal', 'mensal'))
);
--> statement-breakpoint
CREATE TABLE "pedidos_itens" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"pedido_id" uuid NOT NULL,
	"produto_id" uuid,
	"fornecedor_id" uuid,
	"descricao_produto" text NOT NULL,
	"quantidade" numeric(14, 3) NOT NULL,
	"estoque_atual" numeric(14, 3),
	"estoque_min" numeric(14, 3),
	"estoque_max" numeric(14, 3),
	CONSTRAINT "pedidos_itens_quantidade_check" CHECK ("pedidos_itens"."quantidade" > 0)
);
--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_itens" ADD CONSTRAINT "pedidos_itens_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_itens" ADD CONSTRAINT "pedidos_itens_produto_id_produtos_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."produtos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_itens" ADD CONSTRAINT "pedidos_itens_fornecedor_id_fornecedores_id_fk" FOREIGN KEY ("fornecedor_id") REFERENCES "public"."fornecedores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pedidos_empresa_status_idx" ON "pedidos" USING btree ("empresa_id","status");--> statement-breakpoint
CREATE INDEX "pedidos_itens_pedido_idx" ON "pedidos_itens" USING btree ("pedido_id");