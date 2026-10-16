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
ALTER TABLE "pedidos_eventos" ALTER COLUMN "criado_por" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pedidos_eventos" ADD COLUMN "cotacao_id" uuid;--> statement-breakpoint
ALTER TABLE "pedidos_cotacoes" ADD CONSTRAINT "pedidos_cotacoes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_cotacoes" ADD CONSTRAINT "pedidos_cotacoes_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_cotacoes" ADD CONSTRAINT "pedidos_cotacoes_criado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_cotacoes_itens" ADD CONSTRAINT "pedidos_cotacoes_itens_cotacao_id_pedidos_cotacoes_id_fk" FOREIGN KEY ("cotacao_id") REFERENCES "public"."pedidos_cotacoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_cotacoes_itens" ADD CONSTRAINT "pedidos_cotacoes_itens_pedido_item_id_pedidos_itens_id_fk" FOREIGN KEY ("pedido_item_id") REFERENCES "public"."pedidos_itens"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pedidos_cotacoes_token_hash_unico" ON "pedidos_cotacoes" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "pedidos_cotacoes_pedido_aberta_unica" ON "pedidos_cotacoes" USING btree ("pedido_id") WHERE "pedidos_cotacoes"."status" = 'aberta';--> statement-breakpoint
CREATE INDEX "pedidos_cotacoes_empresa_pedido_idx" ON "pedidos_cotacoes" USING btree ("empresa_id","pedido_id");--> statement-breakpoint
ALTER TABLE "pedidos_eventos" ADD CONSTRAINT "pedidos_eventos_cotacao_id_pedidos_cotacoes_id_fk" FOREIGN KEY ("cotacao_id") REFERENCES "public"."pedidos_cotacoes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_eventos" ADD CONSTRAINT "pedidos_eventos_autor_check" CHECK ("pedidos_eventos"."criado_por" is not null or "pedidos_eventos"."cotacao_id" is not null);--> statement-breakpoint
-- R-216: atualizado_em e mantido pelo mesmo gatilho das demais tabelas atualizaveis (funcao da 0002).
CREATE TRIGGER "pedidos_cotacoes_set_atualizado_em"
BEFORE UPDATE ON "pedidos_cotacoes"
FOR EACH ROW
EXECUTE FUNCTION set_atualizado_em();
