CREATE TABLE "compras_adjudicacoes" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"rodada_item_id" uuid NOT NULL,
	"proposta_item_id" uuid NOT NULL,
	"fornecedor_id" uuid NOT NULL,
	"pedido_id" uuid NOT NULL,
	"pedido_item_id" uuid NOT NULL,
	"modo" text NOT NULL,
	"quantidade" numeric(14, 3) NOT NULL,
	"custo_final_unitario" numeric(14, 4) NOT NULL,
	"preco_base_valor" numeric(14, 4),
	"aprovado_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "compras_adjudicacoes_rodada_item_unica" UNIQUE("rodada_item_id"),
	CONSTRAINT "compras_adjudicacoes_proposta_item_unica" UNIQUE("proposta_item_id"),
	CONSTRAINT "compras_adjudicacoes_modo_check" CHECK ("compras_adjudicacoes"."modo" in ('automatica', 'comprador')),
	CONSTRAINT "compras_adjudicacoes_aprovador_check" CHECK (("compras_adjudicacoes"."modo" = 'automatica' and "compras_adjudicacoes"."aprovado_por" is null) or ("compras_adjudicacoes"."modo" = 'comprador' and "compras_adjudicacoes"."aprovado_por" is not null))
);
--> statement-breakpoint
CREATE TABLE "compras_convites_itens" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"convite_id" uuid NOT NULL,
	"rodada_item_id" uuid NOT NULL,
	CONSTRAINT "compras_convites_itens_id_empresa_unica" UNIQUE("id","empresa_id"),
	CONSTRAINT "compras_convites_itens_convite_item_unica" UNIQUE("convite_id","rodada_item_id")
);
--> statement-breakpoint
CREATE TABLE "compras_propostas" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"convite_id" uuid NOT NULL,
	"versao" integer NOT NULL,
	"autor_tipo" text NOT NULL,
	"autor_usuario_id" text,
	"status" text NOT NULL,
	"frete" numeric(14, 2),
	"desconto_geral_tipo" text,
	"desconto_geral_valor" numeric(14, 4),
	"observacao" text,
	"prazo_entrega" date,
	"condicao_pagamento" text,
	"total_bruto" numeric(14, 2),
	"total_final" numeric(14, 2),
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"enviada_em" timestamp with time zone,
	CONSTRAINT "compras_propostas_id_empresa_unica" UNIQUE("id","empresa_id"),
	CONSTRAINT "compras_propostas_convite_versao_unica" UNIQUE("convite_id","versao"),
	CONSTRAINT "compras_propostas_autor_tipo_check" CHECK ("compras_propostas"."autor_tipo" in ('fornecedor', 'comprador')),
	CONSTRAINT "compras_propostas_autor_check" CHECK (("compras_propostas"."autor_tipo" = 'comprador' and "compras_propostas"."autor_usuario_id" is not null) or ("compras_propostas"."autor_tipo" = 'fornecedor' and "compras_propostas"."autor_usuario_id" is null)),
	CONSTRAINT "compras_propostas_status_check" CHECK ("compras_propostas"."status" in ('rascunho', 'enviada')),
	CONSTRAINT "compras_propostas_rascunho_check" CHECK ("compras_propostas"."autor_tipo" = 'fornecedor' or "compras_propostas"."status" = 'enviada'),
	CONSTRAINT "compras_propostas_frete_check" CHECK ("compras_propostas"."frete" is null or "compras_propostas"."frete" >= 0),
	CONSTRAINT "compras_propostas_desconto_geral_tipo_check" CHECK ("compras_propostas"."desconto_geral_tipo" is null or "compras_propostas"."desconto_geral_tipo" in ('valor', 'percentual'))
);
--> statement-breakpoint
CREATE TABLE "compras_propostas_itens" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"proposta_id" uuid NOT NULL,
	"convite_item_id" uuid NOT NULL,
	"indisponivel" boolean DEFAULT false NOT NULL,
	"valor_unitario" numeric(14, 2),
	"desconto_tipo" text,
	"desconto_valor" numeric(14, 4),
	"valor_unitario_final" numeric(14, 4),
	"frete_rateado" numeric(14, 2),
	"custo_final_unitario" numeric(14, 4),
	"total_final" numeric(14, 2),
	CONSTRAINT "compras_propostas_itens_id_empresa_unica" UNIQUE("id","empresa_id"),
	CONSTRAINT "compras_propostas_itens_proposta_item_unica" UNIQUE("proposta_id","convite_item_id"),
	CONSTRAINT "compras_propostas_itens_valor_check" CHECK ("compras_propostas_itens"."valor_unitario" is null or "compras_propostas_itens"."valor_unitario" >= 0),
	CONSTRAINT "compras_propostas_itens_desconto_tipo_check" CHECK ("compras_propostas_itens"."desconto_tipo" is null or "compras_propostas_itens"."desconto_tipo" in ('valor', 'percentual'))
);
--> statement-breakpoint
CREATE TABLE "compras_rodadas" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"solicitacao_id" uuid NOT NULL,
	"numero" integer NOT NULL,
	"status" text DEFAULT 'aberta' NOT NULL,
	"prazo_resposta_horas" integer,
	"expira_em" timestamp with time zone NOT NULL,
	"fuso_horario" text NOT NULL,
	"teto_valor" numeric(14, 2),
	"aberta_por" text NOT NULL,
	"aberta_em" timestamp with time zone DEFAULT now() NOT NULL,
	"fechada_por" text,
	"fechada_em" timestamp with time zone,
	"motivo_fechamento" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "compras_rodadas_id_empresa_unica" UNIQUE("id","empresa_id"),
	CONSTRAINT "compras_rodadas_solicitacao_numero_unica" UNIQUE("solicitacao_id","numero"),
	CONSTRAINT "compras_rodadas_status_check" CHECK ("compras_rodadas"."status" in ('aberta', 'fechada', 'cancelada')),
	CONSTRAINT "compras_rodadas_prazo_check" CHECK ("compras_rodadas"."prazo_resposta_horas" is null or "compras_rodadas"."prazo_resposta_horas" > 0),
	CONSTRAINT "compras_rodadas_teto_check" CHECK ("compras_rodadas"."teto_valor" is null or "compras_rodadas"."teto_valor" > 0),
	CONSTRAINT "compras_rodadas_expira_check" CHECK ("compras_rodadas"."expira_em" > "compras_rodadas"."aberta_em"),
	CONSTRAINT "compras_rodadas_fechamento_check" CHECK (("compras_rodadas"."status" = 'aberta') = ("compras_rodadas"."fechada_em" is null)),
	CONSTRAINT "compras_rodadas_motivo_check" CHECK ("compras_rodadas"."fechada_em" is null or "compras_rodadas"."motivo_fechamento" in ('prazo', 'comprador', 'cancelada')),
	CONSTRAINT "compras_rodadas_motivo_autor_check" CHECK ("compras_rodadas"."motivo_fechamento" is distinct from 'prazo' or "compras_rodadas"."fechada_por" is null)
);
--> statement-breakpoint
CREATE TABLE "compras_rodadas_convites" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"rodada_id" uuid NOT NULL,
	"fornecedor_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"status" text DEFAULT 'aberto' NOT NULL,
	"whatsapp_enviado" text,
	"enviado_em" timestamp with time zone,
	"criado_por" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"respondido_em" timestamp with time zone,
	"revogado_em" timestamp with time zone,
	CONSTRAINT "compras_rodadas_convites_id_empresa_unica" UNIQUE("id","empresa_id"),
	CONSTRAINT "compras_rodadas_convites_rodada_fornecedor_unica" UNIQUE("rodada_id","fornecedor_id"),
	CONSTRAINT "compras_rodadas_convites_status_check" CHECK ("compras_rodadas_convites"."status" in ('aberto', 'aguardando_comprador', 'encerrado', 'revogado'))
);
--> statement-breakpoint
CREATE TABLE "compras_rodadas_itens" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"rodada_id" uuid NOT NULL,
	"solicitacao_item_id" uuid NOT NULL,
	"quantidade" numeric(14, 3) NOT NULL,
	"preco_base_valor" numeric(14, 4),
	"preco_base_id" uuid,
	CONSTRAINT "compras_rodadas_itens_id_empresa_unica" UNIQUE("id","empresa_id"),
	CONSTRAINT "compras_rodadas_itens_rodada_item_unica" UNIQUE("rodada_id","solicitacao_item_id"),
	CONSTRAINT "compras_rodadas_itens_quantidade_check" CHECK ("compras_rodadas_itens"."quantidade" > 0),
	CONSTRAINT "compras_rodadas_itens_base_check" CHECK (("compras_rodadas_itens"."preco_base_id" is null) = ("compras_rodadas_itens"."preco_base_valor" is null))
);
--> statement-breakpoint
CREATE TABLE "compras_solicitacoes" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"status" text DEFAULT 'rascunho' NOT NULL,
	"origem" text NOT NULL,
	"observacao" text,
	"criado_por" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"encerrada_em" timestamp with time zone,
	CONSTRAINT "compras_solicitacoes_id_empresa_unica" UNIQUE("id","empresa_id"),
	CONSTRAINT "compras_solicitacoes_status_check" CHECK ("compras_solicitacoes"."status" in ('rascunho', 'em_cotacao', 'parcialmente_comprada', 'comprada', 'encerrada', 'cancelada')),
	CONSTRAINT "compras_solicitacoes_origem_check" CHECK ("compras_solicitacoes"."origem" in ('manual', 'sugestao', 'rapida')),
	CONSTRAINT "compras_solicitacoes_encerramento_check" CHECK (("compras_solicitacoes"."status" in ('encerrada', 'cancelada', 'comprada')) = ("compras_solicitacoes"."encerrada_em" is not null))
);
--> statement-breakpoint
CREATE TABLE "compras_solicitacoes_itens" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"solicitacao_id" uuid NOT NULL,
	"produto_id" uuid NOT NULL,
	"descricao_produto" text NOT NULL,
	"quantidade" numeric(14, 3) NOT NULL,
	"estoque_atual" numeric(14, 3),
	"estoque_min" numeric(14, 3),
	"estoque_max" numeric(14, 3),
	CONSTRAINT "compras_solicitacoes_itens_id_empresa_unica" UNIQUE("id","empresa_id"),
	CONSTRAINT "compras_solicitacoes_itens_solicitacao_produto_unica" UNIQUE("solicitacao_id","produto_id"),
	CONSTRAINT "compras_solicitacoes_itens_quantidade_check" CHECK ("compras_solicitacoes_itens"."quantidade" > 0)
);
--> statement-breakpoint
ALTER TABLE "notificacoes" DROP CONSTRAINT "notificacoes_tipo_check";--> statement-breakpoint
ALTER TABLE "pedidos" DROP CONSTRAINT "pedidos_tipo_check";--> statement-breakpoint
ALTER TABLE "pedidos_eventos" DROP CONSTRAINT "pedidos_eventos_autor_check";--> statement-breakpoint
ALTER TABLE "produtos_precos_base" DROP CONSTRAINT "produtos_precos_base_origem_referencia_check";--> statement-breakpoint
ALTER TABLE "fornecedores" ADD COLUMN "situacao" text DEFAULT 'ativo' NOT NULL;--> statement-breakpoint
ALTER TABLE "pedidos" ADD COLUMN "solicitacao_id" uuid;--> statement-breakpoint
ALTER TABLE "pedidos" ADD COLUMN "rodada_id" uuid;--> statement-breakpoint
ALTER TABLE "pedidos_eventos" ADD COLUMN "proposta_id" uuid;--> statement-breakpoint
ALTER TABLE "produtos_precos_base" ADD COLUMN "rodada_id" uuid;--> statement-breakpoint
ALTER TABLE "compras_adjudicacoes" ADD CONSTRAINT "compras_adjudicacoes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_adjudicacoes" ADD CONSTRAINT "compras_adjudicacoes_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_adjudicacoes" ADD CONSTRAINT "compras_adjudicacoes_pedido_item_id_pedidos_itens_id_fk" FOREIGN KEY ("pedido_item_id") REFERENCES "public"."pedidos_itens"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_adjudicacoes" ADD CONSTRAINT "compras_adjudicacoes_aprovado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("aprovado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_adjudicacoes" ADD CONSTRAINT "compras_adjudicacoes_rodada_item_empresa_fk" FOREIGN KEY ("rodada_item_id","empresa_id") REFERENCES "public"."compras_rodadas_itens"("id","empresa_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_adjudicacoes" ADD CONSTRAINT "compras_adjudicacoes_proposta_item_empresa_fk" FOREIGN KEY ("proposta_item_id","empresa_id") REFERENCES "public"."compras_propostas_itens"("id","empresa_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_adjudicacoes" ADD CONSTRAINT "compras_adjudicacoes_fornecedor_empresa_fk" FOREIGN KEY ("fornecedor_id","empresa_id") REFERENCES "public"."fornecedores"("id","empresa_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_convites_itens" ADD CONSTRAINT "compras_convites_itens_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_convites_itens" ADD CONSTRAINT "compras_convites_itens_convite_empresa_fk" FOREIGN KEY ("convite_id","empresa_id") REFERENCES "public"."compras_rodadas_convites"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_convites_itens" ADD CONSTRAINT "compras_convites_itens_rodada_item_empresa_fk" FOREIGN KEY ("rodada_item_id","empresa_id") REFERENCES "public"."compras_rodadas_itens"("id","empresa_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_propostas" ADD CONSTRAINT "compras_propostas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_propostas" ADD CONSTRAINT "compras_propostas_autor_usuario_id_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("autor_usuario_id") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_propostas" ADD CONSTRAINT "compras_propostas_convite_empresa_fk" FOREIGN KEY ("convite_id","empresa_id") REFERENCES "public"."compras_rodadas_convites"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_propostas_itens" ADD CONSTRAINT "compras_propostas_itens_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_propostas_itens" ADD CONSTRAINT "compras_propostas_itens_proposta_empresa_fk" FOREIGN KEY ("proposta_id","empresa_id") REFERENCES "public"."compras_propostas"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_propostas_itens" ADD CONSTRAINT "compras_propostas_itens_convite_item_empresa_fk" FOREIGN KEY ("convite_item_id","empresa_id") REFERENCES "public"."compras_convites_itens"("id","empresa_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_rodadas" ADD CONSTRAINT "compras_rodadas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_rodadas" ADD CONSTRAINT "compras_rodadas_aberta_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("aberta_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_rodadas" ADD CONSTRAINT "compras_rodadas_fechada_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("fechada_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_rodadas" ADD CONSTRAINT "compras_rodadas_solicitacao_empresa_fk" FOREIGN KEY ("solicitacao_id","empresa_id") REFERENCES "public"."compras_solicitacoes"("id","empresa_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_rodadas_convites" ADD CONSTRAINT "compras_rodadas_convites_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_rodadas_convites" ADD CONSTRAINT "compras_rodadas_convites_criado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_rodadas_convites" ADD CONSTRAINT "compras_rodadas_convites_rodada_empresa_fk" FOREIGN KEY ("rodada_id","empresa_id") REFERENCES "public"."compras_rodadas"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_rodadas_convites" ADD CONSTRAINT "compras_rodadas_convites_fornecedor_empresa_fk" FOREIGN KEY ("fornecedor_id","empresa_id") REFERENCES "public"."fornecedores"("id","empresa_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_rodadas_itens" ADD CONSTRAINT "compras_rodadas_itens_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_rodadas_itens" ADD CONSTRAINT "compras_rodadas_itens_preco_base_id_produtos_precos_base_id_fk" FOREIGN KEY ("preco_base_id") REFERENCES "public"."produtos_precos_base"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_rodadas_itens" ADD CONSTRAINT "compras_rodadas_itens_rodada_empresa_fk" FOREIGN KEY ("rodada_id","empresa_id") REFERENCES "public"."compras_rodadas"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_rodadas_itens" ADD CONSTRAINT "compras_rodadas_itens_solicitacao_item_empresa_fk" FOREIGN KEY ("solicitacao_item_id","empresa_id") REFERENCES "public"."compras_solicitacoes_itens"("id","empresa_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_solicitacoes" ADD CONSTRAINT "compras_solicitacoes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_solicitacoes" ADD CONSTRAINT "compras_solicitacoes_criado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_solicitacoes_itens" ADD CONSTRAINT "compras_solicitacoes_itens_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_solicitacoes_itens" ADD CONSTRAINT "compras_solicitacoes_itens_solicitacao_empresa_fk" FOREIGN KEY ("solicitacao_id","empresa_id") REFERENCES "public"."compras_solicitacoes"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_solicitacoes_itens" ADD CONSTRAINT "compras_solicitacoes_itens_produto_empresa_fk" FOREIGN KEY ("produto_id","empresa_id") REFERENCES "public"."produtos"("id","empresa_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "compras_adjudicacoes_pedido_idx" ON "compras_adjudicacoes" USING btree ("pedido_id");--> statement-breakpoint
CREATE INDEX "compras_adjudicacoes_empresa_fornecedor_idx" ON "compras_adjudicacoes" USING btree ("empresa_id","fornecedor_id");--> statement-breakpoint
CREATE INDEX "compras_convites_itens_rodada_item_idx" ON "compras_convites_itens" USING btree ("rodada_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "compras_propostas_convite_rascunho_unica" ON "compras_propostas" USING btree ("convite_id") WHERE "compras_propostas"."status" = 'rascunho';--> statement-breakpoint
CREATE INDEX "compras_propostas_empresa_convite_idx" ON "compras_propostas" USING btree ("empresa_id","convite_id","versao");--> statement-breakpoint
CREATE INDEX "compras_propostas_itens_convite_item_idx" ON "compras_propostas_itens" USING btree ("convite_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "compras_rodadas_solicitacao_aberta_unica" ON "compras_rodadas" USING btree ("solicitacao_id") WHERE "compras_rodadas"."status" = 'aberta';--> statement-breakpoint
CREATE INDEX "compras_rodadas_expira_aberta_idx" ON "compras_rodadas" USING btree ("expira_em") WHERE "compras_rodadas"."status" = 'aberta';--> statement-breakpoint
CREATE INDEX "compras_rodadas_empresa_solicitacao_idx" ON "compras_rodadas" USING btree ("empresa_id","solicitacao_id");--> statement-breakpoint
CREATE UNIQUE INDEX "compras_rodadas_convites_token_hash_unico" ON "compras_rodadas_convites" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "compras_rodadas_convites_empresa_rodada_idx" ON "compras_rodadas_convites" USING btree ("empresa_id","rodada_id");--> statement-breakpoint
CREATE INDEX "compras_rodadas_itens_rodada_idx" ON "compras_rodadas_itens" USING btree ("rodada_id");--> statement-breakpoint
CREATE INDEX "compras_solicitacoes_empresa_status_idx" ON "compras_solicitacoes" USING btree ("empresa_id","status","criado_em");--> statement-breakpoint
CREATE INDEX "compras_solicitacoes_itens_solicitacao_idx" ON "compras_solicitacoes_itens" USING btree ("solicitacao_id");--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_solicitacao_id_compras_solicitacoes_id_fk" FOREIGN KEY ("solicitacao_id") REFERENCES "public"."compras_solicitacoes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_rodada_id_compras_rodadas_id_fk" FOREIGN KEY ("rodada_id") REFERENCES "public"."compras_rodadas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_eventos" ADD CONSTRAINT "pedidos_eventos_proposta_id_compras_propostas_id_fk" FOREIGN KEY ("proposta_id") REFERENCES "public"."compras_propostas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produtos_precos_base" ADD CONSTRAINT "produtos_precos_base_rodada_id_compras_rodadas_id_fk" FOREIGN KEY ("rodada_id") REFERENCES "public"."compras_rodadas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fornecedores_empresa_situacao_idx" ON "fornecedores" USING btree ("empresa_id","situacao");--> statement-breakpoint
CREATE UNIQUE INDEX "pedidos_rodada_fornecedor_confirmado_idx" ON "pedidos" USING btree ("rodada_id","fornecedor_id") WHERE "pedidos"."status" = 'confirmado';--> statement-breakpoint
ALTER TABLE "fornecedores" ADD CONSTRAINT "fornecedores_situacao_check" CHECK ("fornecedores"."situacao" in ('ativo', 'inativo'));--> statement-breakpoint
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_tipo_check" CHECK ("notificacoes"."tipo" in ('quebra_caixa', 'transferencia_divergencia', 'transferencia_prazo_confirmacao',
        'mensagem_admin', 'campanha', 'lancamento_vencimento', 'compras_decisao_pendente'));--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_tipo_check" CHECK ("pedidos"."tipo" in ('manual', 'automatico', 'rodada'));--> statement-breakpoint
ALTER TABLE "pedidos_eventos" ADD CONSTRAINT "pedidos_eventos_autor_check" CHECK (num_nonnulls("pedidos_eventos"."criado_por", "pedidos_eventos"."cotacao_id", "pedidos_eventos"."proposta_id") >= 1);--> statement-breakpoint
ALTER TABLE "produtos_precos_base" ADD CONSTRAINT "produtos_precos_base_origem_referencia_check" CHECK (("produtos_precos_base"."origem" = 'importacao' and "produtos_precos_base"."importacao_item_id" is not null) or ("produtos_precos_base"."origem" = 'rodada' and "produtos_precos_base"."rodada_id" is not null));
--> statement-breakpoint
CREATE TRIGGER "compras_solicitacoes_set_atualizado_em"
BEFORE UPDATE ON "compras_solicitacoes"
FOR EACH ROW
EXECUTE FUNCTION set_atualizado_em();
--> statement-breakpoint
CREATE TRIGGER "compras_rodadas_set_atualizado_em"
BEFORE UPDATE ON "compras_rodadas"
FOR EACH ROW
EXECUTE FUNCTION set_atualizado_em();
--> statement-breakpoint
CREATE TRIGGER "compras_rodadas_convites_set_atualizado_em"
BEFORE UPDATE ON "compras_rodadas_convites"
FOR EACH ROW
EXECUTE FUNCTION set_atualizado_em();
--> statement-breakpoint
CREATE TRIGGER "compras_propostas_set_atualizado_em"
BEFORE UPDATE ON "compras_propostas"
FOR EACH ROW
EXECUTE FUNCTION set_atualizado_em();
