CREATE TABLE "conferencias_estoque" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"grupo_mercadoria_id" uuid,
	"area_estoque" text,
	"local_venda" text,
	"local_estoque" text,
	"curva_abc" text,
	"agendada_para" timestamp with time zone NOT NULL,
	"observacao" text,
	"status" text DEFAULT 'agendada' NOT NULL,
	"criado_por" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conferencias_estoque_status_check" CHECK ("conferencias_estoque"."status" in ('agendada', 'cancelada', 'concluida')),
	CONSTRAINT "conferencias_estoque_curva_abc_check" CHECK ("conferencias_estoque"."curva_abc" is null or "conferencias_estoque"."curva_abc" in ('A', 'B', 'C'))
);
--> statement-breakpoint
CREATE TABLE "estoque_movimentos" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"produto_id" uuid NOT NULL,
	"pedido_item_id" uuid NOT NULL,
	"pedido_recebimento_id" uuid NOT NULL,
	"tipo" text DEFAULT 'recebimento_compra' NOT NULL,
	"quantidade" numeric(14, 3) NOT NULL,
	"saldo_anterior" numeric(14, 3) NOT NULL,
	"saldo_posterior" numeric(14, 3) NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "estoque_movimentos_recebimento_item_unico" UNIQUE("pedido_recebimento_id","pedido_item_id"),
	CONSTRAINT "estoque_movimentos_tipo_check" CHECK ("estoque_movimentos"."tipo" = 'recebimento_compra'),
	CONSTRAINT "estoque_movimentos_quantidade_check" CHECK ("estoque_movimentos"."quantidade" > 0),
	CONSTRAINT "estoque_movimentos_saldo_check" CHECK ("estoque_movimentos"."saldo_posterior" = "estoque_movimentos"."saldo_anterior" + "estoque_movimentos"."quantidade")
);
--> statement-breakpoint
CREATE TABLE "pedidos_cotacoes" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"pedido_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"status" text DEFAULT 'aberta' NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"desconto_geral_tipo" text,
	"desconto_geral_valor" numeric(14, 4),
	"observacao" text,
	"prazo_entrega" date,
	"condicao_pagamento" text,
	"total_bruto" numeric(14, 2),
	"total_final" numeric(14, 2),
	"criado_por" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"respondida_em" timestamp with time zone,
	"revogada_em" timestamp with time zone,
	CONSTRAINT "pedidos_cotacoes_status_check" CHECK ("pedidos_cotacoes"."status" in ('aberta', 'respondida', 'revogada')),
	CONSTRAINT "pedidos_cotacoes_desconto_geral_tipo_check" CHECK ("pedidos_cotacoes"."desconto_geral_tipo" is null or "pedidos_cotacoes"."desconto_geral_tipo" in ('valor', 'percentual'))
);
--> statement-breakpoint
CREATE TABLE "pedidos_cotacoes_itens" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"cotacao_id" uuid NOT NULL,
	"pedido_item_id" uuid NOT NULL,
	"indisponivel" boolean DEFAULT false NOT NULL,
	"valor_unitario" numeric(14, 2),
	"desconto_tipo" text,
	"desconto_valor" numeric(14, 4),
	"valor_unitario_final" numeric(14, 4),
	"total_final" numeric(14, 2),
	CONSTRAINT "pedidos_cotacoes_itens_cotacao_item_unico" UNIQUE("cotacao_id","pedido_item_id"),
	CONSTRAINT "pedidos_cotacoes_itens_desconto_tipo_check" CHECK ("pedidos_cotacoes_itens"."desconto_tipo" is null or "pedidos_cotacoes_itens"."desconto_tipo" in ('valor', 'percentual')),
	CONSTRAINT "pedidos_cotacoes_itens_valor_check" CHECK ("pedidos_cotacoes_itens"."valor_unitario" is null or "pedidos_cotacoes_itens"."valor_unitario" >= 0)
);
--> statement-breakpoint
CREATE TABLE "pedidos_eventos" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"pedido_id" uuid NOT NULL,
	"status" text NOT NULL,
	"observacao" text,
	"criado_por" text,
	"cotacao_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pedidos_eventos_autor_check" CHECK ("pedidos_eventos"."criado_por" is not null or "pedidos_eventos"."cotacao_id" is not null),
	CONSTRAINT "pedidos_eventos_status_check" CHECK ("pedidos_eventos"."status" in ('a_fazer', 'enviado', 'retornado', 'confirmado', 'recebido_parcial', 'recebido', 'cancelado'))
);
--> statement-breakpoint
CREATE TABLE "pedidos_recebimentos" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"pedido_id" uuid NOT NULL,
	"observacao" text,
	"idempotencia_chave" uuid NOT NULL,
	"recebido_por" text NOT NULL,
	"recebido_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pedidos_recebimentos_empresa_idempotencia_unica" UNIQUE("empresa_id","idempotencia_chave")
);
--> statement-breakpoint
ALTER TABLE "pedidos" DROP CONSTRAINT "pedidos_status_check";--> statement-breakpoint
ALTER TABLE "pedidos" ALTER COLUMN "status" SET DEFAULT 'a_fazer';--> statement-breakpoint
ALTER TABLE "fornecedores" ADD COLUMN "whatsapp" text;--> statement-breakpoint
ALTER TABLE "pedidos" ADD COLUMN "fornecedor_id" uuid;--> statement-breakpoint
ALTER TABLE "produtos" ADD COLUMN "area_estoque" text;--> statement-breakpoint
ALTER TABLE "produtos" ADD COLUMN "curva_abc" text;--> statement-breakpoint
ALTER TABLE "conferencias_estoque" ADD CONSTRAINT "conferencias_estoque_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conferencias_estoque" ADD CONSTRAINT "conferencias_estoque_grupo_mercadoria_id_grupos_mercadorias_id_fk" FOREIGN KEY ("grupo_mercadoria_id") REFERENCES "public"."grupos_mercadorias"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conferencias_estoque" ADD CONSTRAINT "conferencias_estoque_criado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estoque_movimentos" ADD CONSTRAINT "estoque_movimentos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estoque_movimentos" ADD CONSTRAINT "estoque_movimentos_produto_id_produtos_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."produtos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estoque_movimentos" ADD CONSTRAINT "estoque_movimentos_pedido_item_id_pedidos_itens_id_fk" FOREIGN KEY ("pedido_item_id") REFERENCES "public"."pedidos_itens"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estoque_movimentos" ADD CONSTRAINT "estoque_movimentos_pedido_recebimento_id_pedidos_recebimentos_id_fk" FOREIGN KEY ("pedido_recebimento_id") REFERENCES "public"."pedidos_recebimentos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_cotacoes" ADD CONSTRAINT "pedidos_cotacoes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_cotacoes" ADD CONSTRAINT "pedidos_cotacoes_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_cotacoes" ADD CONSTRAINT "pedidos_cotacoes_criado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_cotacoes_itens" ADD CONSTRAINT "pedidos_cotacoes_itens_cotacao_id_pedidos_cotacoes_id_fk" FOREIGN KEY ("cotacao_id") REFERENCES "public"."pedidos_cotacoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_cotacoes_itens" ADD CONSTRAINT "pedidos_cotacoes_itens_pedido_item_id_pedidos_itens_id_fk" FOREIGN KEY ("pedido_item_id") REFERENCES "public"."pedidos_itens"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_eventos" ADD CONSTRAINT "pedidos_eventos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_eventos" ADD CONSTRAINT "pedidos_eventos_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_eventos" ADD CONSTRAINT "pedidos_eventos_criado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_eventos" ADD CONSTRAINT "pedidos_eventos_cotacao_id_pedidos_cotacoes_id_fk" FOREIGN KEY ("cotacao_id") REFERENCES "public"."pedidos_cotacoes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_recebimentos" ADD CONSTRAINT "pedidos_recebimentos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_recebimentos" ADD CONSTRAINT "pedidos_recebimentos_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_recebimentos" ADD CONSTRAINT "pedidos_recebimentos_recebido_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("recebido_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conferencias_estoque_empresa_agendada_idx" ON "conferencias_estoque" USING btree ("empresa_id","agendada_para");--> statement-breakpoint
CREATE INDEX "estoque_movimentos_empresa_produto_criado_idx" ON "estoque_movimentos" USING btree ("empresa_id","produto_id","criado_em");--> statement-breakpoint
CREATE UNIQUE INDEX "pedidos_cotacoes_token_hash_unico" ON "pedidos_cotacoes" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "pedidos_cotacoes_pedido_aberta_unica" ON "pedidos_cotacoes" USING btree ("pedido_id") WHERE "pedidos_cotacoes"."status" = 'aberta';--> statement-breakpoint
CREATE INDEX "pedidos_cotacoes_empresa_pedido_idx" ON "pedidos_cotacoes" USING btree ("empresa_id","pedido_id");--> statement-breakpoint
CREATE INDEX "pedidos_eventos_empresa_pedido_criado_idx" ON "pedidos_eventos" USING btree ("empresa_id","pedido_id","criado_em");--> statement-breakpoint
CREATE INDEX "pedidos_recebimentos_empresa_pedido_recebido_idx" ON "pedidos_recebimentos" USING btree ("empresa_id","pedido_id","recebido_em");--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_fornecedor_id_fornecedores_id_fk" FOREIGN KEY ("fornecedor_id") REFERENCES "public"."fornecedores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_status_check" CHECK ("pedidos"."status" in ('rascunho', 'aprovado', 'a_fazer', 'enviado', 'retornado', 'confirmado', 'recebido_parcial', 'recebido', 'cancelado'));--> statement-breakpoint
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_curva_abc_check" CHECK ("produtos"."curva_abc" is null or "produtos"."curva_abc" in ('A', 'B', 'C'));