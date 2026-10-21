CREATE TABLE "compras_historico_importacao_itens" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"importacao_id" uuid NOT NULL,
	"numero_linha" integer NOT NULL,
	"fornecedor_informado" text NOT NULL,
	"fornecedor_normalizado" text NOT NULL,
	"produto_informado" text NOT NULL,
	"produto_normalizado" text NOT NULL,
	"data_compra" date,
	"quantidade" numeric(14, 3),
	"custo_unitario" numeric(14, 4),
	"documento" text,
	"fornecedor_id" uuid,
	"produto_id" uuid,
	"resultado" text NOT NULL,
	"detalhe" text,
	CONSTRAINT "compras_historico_itens_linha_unica" UNIQUE("importacao_id","numero_linha"),
	CONSTRAINT "compras_historico_itens_linha_check" CHECK ("compras_historico_importacao_itens"."numero_linha" > 0),
	CONSTRAINT "compras_historico_itens_resultado_check" CHECK ("compras_historico_importacao_itens"."resultado" in ('correspondencia', 'fornecedor_nao_encontrado', 'produto_nao_encontrado', 'ambiguidade', 'invalido'))
);
--> statement-breakpoint
CREATE TABLE "compras_historico_importacoes" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome_arquivo" text NOT NULL,
	"hash_arquivo" text NOT NULL,
	"status" text DEFAULT 'analisada' NOT NULL,
	"total_linhas" integer NOT NULL,
	"total_pareadas" integer DEFAULT 0 NOT NULL,
	"total_pendentes" integer DEFAULT 0 NOT NULL,
	"total_aplicadas" integer DEFAULT 0 NOT NULL,
	"periodo_inicio" date,
	"periodo_fim" date,
	"criado_por" text NOT NULL,
	"aplicado_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"aplicado_em" timestamp with time zone,
	CONSTRAINT "compras_historico_importacoes_empresa_hash_unico" UNIQUE("empresa_id","hash_arquivo"),
	CONSTRAINT "compras_historico_importacoes_status_check" CHECK ("compras_historico_importacoes"."status" in ('analisada', 'aplicada', 'cancelada')),
	CONSTRAINT "compras_historico_importacoes_totais_check" CHECK ("compras_historico_importacoes"."total_linhas" >= 0 and "compras_historico_importacoes"."total_pareadas" >= 0 and "compras_historico_importacoes"."total_pendentes" >= 0 and "compras_historico_importacoes"."total_aplicadas" >= 0)
);
--> statement-breakpoint
CREATE TABLE "compras_historico_precos" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"fornecedor_id" uuid NOT NULL,
	"produto_id" uuid NOT NULL,
	"data_compra" date NOT NULL,
	"quantidade" numeric(14, 3) NOT NULL,
	"custo_unitario" numeric(14, 4) NOT NULL,
	"documento" text,
	"origem" text NOT NULL,
	"importacao_item_id" uuid,
	"pedido_item_id" uuid,
	"criado_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "compras_historico_precos_importacao_unica" UNIQUE("importacao_item_id"),
	CONSTRAINT "compras_historico_precos_quantidade_check" CHECK ("compras_historico_precos"."quantidade" > 0),
	CONSTRAINT "compras_historico_precos_custo_check" CHECK ("compras_historico_precos"."custo_unitario" > 0),
	CONSTRAINT "compras_historico_precos_origem_check" CHECK ("compras_historico_precos"."origem" in ('planilha', 'recebimento')),
	CONSTRAINT "compras_historico_precos_origem_referencia_check" CHECK (("compras_historico_precos"."origem" = 'planilha' and "compras_historico_precos"."importacao_item_id" is not null and "compras_historico_precos"."pedido_item_id" is null) or ("compras_historico_precos"."origem" = 'recebimento' and "compras_historico_precos"."pedido_item_id" is not null and "compras_historico_precos"."importacao_item_id" is null))
);
--> statement-breakpoint
CREATE TABLE "fornecedores_aliases" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"fornecedor_id" uuid NOT NULL,
	"alias_normalizado" text NOT NULL,
	"criado_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fornecedores_aliases_empresa_alias_unico" UNIQUE("empresa_id","alias_normalizado")
);
--> statement-breakpoint
ALTER TABLE "compras_historico_importacao_itens" ADD CONSTRAINT "compras_historico_importacao_itens_importacao_id_compras_historico_importacoes_id_fk" FOREIGN KEY ("importacao_id") REFERENCES "public"."compras_historico_importacoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_historico_importacao_itens" ADD CONSTRAINT "compras_historico_importacao_itens_fornecedor_id_fornecedores_id_fk" FOREIGN KEY ("fornecedor_id") REFERENCES "public"."fornecedores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_historico_importacao_itens" ADD CONSTRAINT "compras_historico_importacao_itens_produto_id_produtos_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."produtos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_historico_importacoes" ADD CONSTRAINT "compras_historico_importacoes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_historico_importacoes" ADD CONSTRAINT "compras_historico_importacoes_criado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_historico_importacoes" ADD CONSTRAINT "compras_historico_importacoes_aplicado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("aplicado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_historico_precos" ADD CONSTRAINT "compras_historico_precos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_historico_precos" ADD CONSTRAINT "compras_historico_precos_importacao_item_id_compras_historico_importacao_itens_id_fk" FOREIGN KEY ("importacao_item_id") REFERENCES "public"."compras_historico_importacao_itens"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_historico_precos" ADD CONSTRAINT "compras_historico_precos_pedido_item_id_pedidos_itens_id_fk" FOREIGN KEY ("pedido_item_id") REFERENCES "public"."pedidos_itens"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_historico_precos" ADD CONSTRAINT "compras_historico_precos_criado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_historico_precos" ADD CONSTRAINT "compras_historico_precos_fornecedor_empresa_fk" FOREIGN KEY ("fornecedor_id","empresa_id") REFERENCES "public"."fornecedores"("id","empresa_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_historico_precos" ADD CONSTRAINT "compras_historico_precos_produto_empresa_fk" FOREIGN KEY ("produto_id","empresa_id") REFERENCES "public"."produtos"("id","empresa_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fornecedores_aliases" ADD CONSTRAINT "fornecedores_aliases_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fornecedores_aliases" ADD CONSTRAINT "fornecedores_aliases_criado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fornecedores_aliases" ADD CONSTRAINT "fornecedores_aliases_fornecedor_empresa_fk" FOREIGN KEY ("fornecedor_id","empresa_id") REFERENCES "public"."fornecedores"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "compras_historico_itens_importacao_resultado_idx" ON "compras_historico_importacao_itens" USING btree ("importacao_id","resultado");--> statement-breakpoint
CREATE INDEX "compras_historico_importacoes_empresa_criado_idx" ON "compras_historico_importacoes" USING btree ("empresa_id","criado_em");--> statement-breakpoint
CREATE INDEX "compras_historico_precos_produto_data_idx" ON "compras_historico_precos" USING btree ("empresa_id","produto_id","data_compra" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "compras_historico_precos_fornecedor_data_idx" ON "compras_historico_precos" USING btree ("empresa_id","fornecedor_id","data_compra" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "fornecedores_aliases_fornecedor_idx" ON "fornecedores_aliases" USING btree ("fornecedor_id");