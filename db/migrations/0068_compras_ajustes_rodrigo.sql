CREATE TABLE "pedidos_devolucoes" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"pedido_id" uuid NOT NULL,
	"pedido_item_id" uuid NOT NULL,
	"pedido_recebimento_id" uuid NOT NULL,
	"quantidade" numeric(14, 3) NOT NULL,
	"motivo" text NOT NULL,
	"devolvido_por" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pedidos_devolucoes_recebimento_item_unico" UNIQUE("pedido_recebimento_id","pedido_item_id"),
	CONSTRAINT "pedidos_devolucoes_quantidade_check" CHECK ("pedidos_devolucoes"."quantidade" > 0),
	CONSTRAINT "pedidos_devolucoes_motivo_check" CHECK (btrim("pedidos_devolucoes"."motivo") <> '')
);
--> statement-breakpoint
ALTER TABLE "compras_rodadas" ADD COLUMN "recebimento_inicio" time;--> statement-breakpoint
ALTER TABLE "compras_rodadas" ADD COLUMN "recebimento_fim" time;--> statement-breakpoint
ALTER TABLE "pedidos_agendas" ADD COLUMN "recebimento_inicio" time;--> statement-breakpoint
ALTER TABLE "pedidos_agendas" ADD COLUMN "recebimento_fim" time;--> statement-breakpoint
ALTER TABLE "pedidos_devolucoes" ADD CONSTRAINT "pedidos_devolucoes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_devolucoes" ADD CONSTRAINT "pedidos_devolucoes_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_devolucoes" ADD CONSTRAINT "pedidos_devolucoes_pedido_item_id_pedidos_itens_id_fk" FOREIGN KEY ("pedido_item_id") REFERENCES "public"."pedidos_itens"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_devolucoes" ADD CONSTRAINT "pedidos_devolucoes_pedido_recebimento_id_pedidos_recebimentos_id_fk" FOREIGN KEY ("pedido_recebimento_id") REFERENCES "public"."pedidos_recebimentos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_devolucoes" ADD CONSTRAINT "pedidos_devolucoes_devolvido_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("devolvido_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pedidos_devolucoes_empresa_pedido_idx" ON "pedidos_devolucoes" USING btree ("empresa_id","pedido_id");--> statement-breakpoint
ALTER TABLE "compras_rodadas" ADD CONSTRAINT "compras_rodadas_recebimento_check" CHECK (("compras_rodadas"."recebimento_inicio" is null) = ("compras_rodadas"."recebimento_fim" is null) and ("compras_rodadas"."recebimento_fim" is null or "compras_rodadas"."recebimento_fim" > "compras_rodadas"."recebimento_inicio"));--> statement-breakpoint
ALTER TABLE "pedidos_agendas" ADD CONSTRAINT "pedidos_agendas_recebimento_check" CHECK (("pedidos_agendas"."recebimento_inicio" is null) = ("pedidos_agendas"."recebimento_fim" is null) and ("pedidos_agendas"."recebimento_fim" is null or "pedidos_agendas"."recebimento_fim" > "pedidos_agendas"."recebimento_inicio"));