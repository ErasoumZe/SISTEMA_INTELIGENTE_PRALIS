DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "grupos_mercadorias" filho
		JOIN "grupos_mercadorias" pai ON pai."id" = filho."grupo_pai_id"
		WHERE filho."empresa_id" <> pai."empresa_id"
	) THEN
		RAISE EXCEPTION 'Existem grupos de mercadorias vinculados a grupos-pai de outra empresa';
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "produtos" produto
		JOIN "grupos_mercadorias" grupo ON grupo."id" = produto."grupo_mercadoria_id"
		WHERE produto."empresa_id" <> grupo."empresa_id"
	) THEN
		RAISE EXCEPTION 'Existem produtos vinculados a grupos de mercadorias de outra empresa';
	END IF;
END $$;
--> statement-breakpoint
CREATE TABLE "compras_importacoes_preco_base" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome_arquivo" text NOT NULL,
	"hash_arquivo" text NOT NULL,
	"status" text DEFAULT 'analisada' NOT NULL,
	"total_linhas" integer NOT NULL,
	"total_correspondencias" integer DEFAULT 0 NOT NULL,
	"total_ambiguidades" integer DEFAULT 0 NOT NULL,
	"total_nao_encontrados" integer DEFAULT 0 NOT NULL,
	"criado_por" text NOT NULL,
	"aplicado_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"aplicado_em" timestamp with time zone,
	CONSTRAINT "compras_importacoes_preco_base_empresa_hash_unico" UNIQUE("empresa_id","hash_arquivo"),
	CONSTRAINT "compras_importacoes_preco_base_status_check" CHECK ("compras_importacoes_preco_base"."status" in ('analisada', 'aplicada', 'cancelada')),
	CONSTRAINT "compras_importacoes_preco_base_totais_check" CHECK ("compras_importacoes_preco_base"."total_linhas" >= 0 and "compras_importacoes_preco_base"."total_correspondencias" >= 0 and "compras_importacoes_preco_base"."total_ambiguidades" >= 0 and "compras_importacoes_preco_base"."total_nao_encontrados" >= 0)
);
--> statement-breakpoint
CREATE TABLE "compras_importacoes_preco_base_itens" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"importacao_id" uuid NOT NULL,
	"numero_linha" integer NOT NULL,
	"codigo_informado" text,
	"ean_informado" text,
	"descricao_informada" text NOT NULL,
	"descricao_normalizada" text NOT NULL,
	"valor_informado" numeric(14, 4) NOT NULL,
	"produto_id" uuid,
	"resultado" text NOT NULL,
	"detalhe" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "compras_importacoes_preco_base_itens_importacao_linha_unica" UNIQUE("importacao_id","numero_linha"),
	CONSTRAINT "compras_importacoes_preco_base_itens_linha_check" CHECK ("compras_importacoes_preco_base_itens"."numero_linha" > 0),
	CONSTRAINT "compras_importacoes_preco_base_itens_valor_check" CHECK ("compras_importacoes_preco_base_itens"."valor_informado" >= 0),
	CONSTRAINT "compras_importacoes_preco_base_itens_resultado_check" CHECK ("compras_importacoes_preco_base_itens"."resultado" in ('correspondencia', 'ambiguidade', 'nao_encontrado', 'invalido'))
);
--> statement-breakpoint
CREATE TABLE "fornecedores_produtos" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"fornecedor_id" uuid NOT NULL,
	"produto_id" uuid NOT NULL,
	"status" text DEFAULT 'pendente' NOT NULL,
	"origem" text NOT NULL,
	"preco_ofertado" numeric(14, 4),
	"observacao" text,
	"criado_por" text,
	"aprovado_por" text,
	"aprovado_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fornecedores_produtos_empresa_fornecedor_produto_unico" UNIQUE("empresa_id","fornecedor_id","produto_id"),
	CONSTRAINT "fornecedores_produtos_status_check" CHECK ("fornecedores_produtos"."status" in ('pendente', 'aprovado', 'rejeitado')),
	CONSTRAINT "fornecedores_produtos_origem_check" CHECK ("fornecedores_produtos"."origem" in ('compras', 'fornecedor')),
	CONSTRAINT "fornecedores_produtos_preco_check" CHECK ("fornecedores_produtos"."preco_ofertado" is null or "fornecedores_produtos"."preco_ofertado" >= 0)
);
--> statement-breakpoint
CREATE TABLE "fornecedores_produtos_eventos" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"fornecedor_produto_id" uuid NOT NULL,
	"status_anterior" text,
	"status_novo" text NOT NULL,
	"preco_ofertado" numeric(14, 4),
	"ator_tipo" text NOT NULL,
	"usuario_id" text,
	"observacao" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fornecedores_produtos_eventos_status_anterior_check" CHECK ("fornecedores_produtos_eventos"."status_anterior" is null or "fornecedores_produtos_eventos"."status_anterior" in ('pendente', 'aprovado', 'rejeitado')),
	CONSTRAINT "fornecedores_produtos_eventos_status_novo_check" CHECK ("fornecedores_produtos_eventos"."status_novo" in ('pendente', 'aprovado', 'rejeitado')),
	CONSTRAINT "fornecedores_produtos_eventos_ator_tipo_check" CHECK ("fornecedores_produtos_eventos"."ator_tipo" in ('usuario', 'fornecedor', 'sistema')),
	CONSTRAINT "fornecedores_produtos_eventos_usuario_check" CHECK (("fornecedores_produtos_eventos"."ator_tipo" = 'usuario' and "fornecedores_produtos_eventos"."usuario_id" is not null) or ("fornecedores_produtos_eventos"."ator_tipo" <> 'usuario'))
);
--> statement-breakpoint
CREATE TABLE "produtos_precos_base" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"produto_id" uuid NOT NULL,
	"valor" numeric(14, 4) NOT NULL,
	"origem" text NOT NULL,
	"importacao_item_id" uuid,
	"referencia_externa" text,
	"valido_desde" timestamp with time zone DEFAULT now() NOT NULL,
	"valido_ate" timestamp with time zone,
	"criado_por" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "produtos_precos_base_valor_check" CHECK ("produtos_precos_base"."valor" >= 0),
	CONSTRAINT "produtos_precos_base_origem_check" CHECK ("produtos_precos_base"."origem" in ('importacao', 'rodada')),
	CONSTRAINT "produtos_precos_base_origem_referencia_check" CHECK (("produtos_precos_base"."origem" = 'importacao' and "produtos_precos_base"."importacao_item_id" is not null) or ("produtos_precos_base"."origem" = 'rodada' and "produtos_precos_base"."referencia_externa" is not null)),
	CONSTRAINT "produtos_precos_base_validade_check" CHECK ("produtos_precos_base"."valido_ate" is null or "produtos_precos_base"."valido_ate" > "produtos_precos_base"."valido_desde")
);
--> statement-breakpoint
ALTER TABLE "grupos_mercadorias" DROP CONSTRAINT "grupos_mercadorias_grupo_pai_id_grupos_mercadorias_id_fk";
--> statement-breakpoint
ALTER TABLE "produtos" DROP CONSTRAINT "produtos_grupo_mercadoria_id_grupos_mercadorias_id_fk";
--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "fuso_horario" text DEFAULT 'America/Sao_Paulo' NOT NULL;--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "compras_prazo_resposta_horas" integer;--> statement-breakpoint
ALTER TABLE "perfis_usuarios" ADD COLUMN "whatsapp" text;--> statement-breakpoint
ALTER TABLE "produtos" ADD COLUMN "quantidade_variavel" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "produtos" ADD COLUMN "tolerancia_quantidade_percentual" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "fornecedores" ADD CONSTRAINT "fornecedores_id_empresa_unica" UNIQUE("id","empresa_id");--> statement-breakpoint
ALTER TABLE "grupos_mercadorias" ADD CONSTRAINT "grupos_mercadorias_id_empresa_unica" UNIQUE("id","empresa_id");--> statement-breakpoint
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_id_empresa_unica" UNIQUE("id","empresa_id");--> statement-breakpoint
ALTER TABLE "compras_importacoes_preco_base" ADD CONSTRAINT "compras_importacoes_preco_base_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_importacoes_preco_base" ADD CONSTRAINT "compras_importacoes_preco_base_criado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_importacoes_preco_base" ADD CONSTRAINT "compras_importacoes_preco_base_aplicado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("aplicado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_importacoes_preco_base_itens" ADD CONSTRAINT "compras_importacoes_preco_base_itens_importacao_id_compras_importacoes_preco_base_id_fk" FOREIGN KEY ("importacao_id") REFERENCES "public"."compras_importacoes_preco_base"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_importacoes_preco_base_itens" ADD CONSTRAINT "compras_importacoes_preco_base_itens_produto_id_produtos_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."produtos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fornecedores_produtos" ADD CONSTRAINT "fornecedores_produtos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fornecedores_produtos" ADD CONSTRAINT "fornecedores_produtos_criado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fornecedores_produtos" ADD CONSTRAINT "fornecedores_produtos_aprovado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("aprovado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fornecedores_produtos" ADD CONSTRAINT "fornecedores_produtos_fornecedor_empresa_fk" FOREIGN KEY ("fornecedor_id","empresa_id") REFERENCES "public"."fornecedores"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fornecedores_produtos" ADD CONSTRAINT "fornecedores_produtos_produto_empresa_fk" FOREIGN KEY ("produto_id","empresa_id") REFERENCES "public"."produtos"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fornecedores_produtos_eventos" ADD CONSTRAINT "fornecedores_produtos_eventos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fornecedores_produtos_eventos" ADD CONSTRAINT "fornecedores_produtos_eventos_fornecedor_produto_id_fornecedores_produtos_id_fk" FOREIGN KEY ("fornecedor_produto_id") REFERENCES "public"."fornecedores_produtos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fornecedores_produtos_eventos" ADD CONSTRAINT "fornecedores_produtos_eventos_usuario_id_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produtos_precos_base" ADD CONSTRAINT "produtos_precos_base_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produtos_precos_base" ADD CONSTRAINT "produtos_precos_base_importacao_item_id_compras_importacoes_preco_base_itens_id_fk" FOREIGN KEY ("importacao_item_id") REFERENCES "public"."compras_importacoes_preco_base_itens"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produtos_precos_base" ADD CONSTRAINT "produtos_precos_base_criado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produtos_precos_base" ADD CONSTRAINT "produtos_precos_base_produto_empresa_fk" FOREIGN KEY ("produto_id","empresa_id") REFERENCES "public"."produtos"("id","empresa_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "compras_importacoes_preco_base_empresa_criado_idx" ON "compras_importacoes_preco_base" USING btree ("empresa_id","criado_em");--> statement-breakpoint
CREATE INDEX "compras_importacoes_preco_base_itens_importacao_resultado_idx" ON "compras_importacoes_preco_base_itens" USING btree ("importacao_id","resultado");--> statement-breakpoint
CREATE INDEX "fornecedores_produtos_empresa_status_idx" ON "fornecedores_produtos" USING btree ("empresa_id","status");--> statement-breakpoint
CREATE INDEX "fornecedores_produtos_fornecedor_idx" ON "fornecedores_produtos" USING btree ("fornecedor_id");--> statement-breakpoint
CREATE INDEX "fornecedores_produtos_eventos_vinculo_criado_idx" ON "fornecedores_produtos_eventos" USING btree ("fornecedor_produto_id","criado_em");--> statement-breakpoint
CREATE UNIQUE INDEX "produtos_precos_base_atual_unico_idx" ON "produtos_precos_base" USING btree ("empresa_id","produto_id") WHERE "produtos_precos_base"."valido_ate" is null;--> statement-breakpoint
CREATE INDEX "produtos_precos_base_empresa_produto_historico_idx" ON "produtos_precos_base" USING btree ("empresa_id","produto_id","valido_desde");--> statement-breakpoint
ALTER TABLE "grupos_mercadorias" ADD CONSTRAINT "grupos_mercadorias_pai_mesma_empresa_fk" FOREIGN KEY ("grupo_pai_id","empresa_id") REFERENCES "public"."grupos_mercadorias"("id","empresa_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_grupo_mercadoria_mesma_empresa_fk" FOREIGN KEY ("grupo_mercadoria_id","empresa_id") REFERENCES "public"."grupos_mercadorias"("id","empresa_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_fuso_horario_check" CHECK (btrim("empresas"."fuso_horario") <> '');--> statement-breakpoint
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_compras_prazo_resposta_horas_check" CHECK ("empresas"."compras_prazo_resposta_horas" is null or "empresas"."compras_prazo_resposta_horas" > 0);--> statement-breakpoint
ALTER TABLE "perfis_usuarios" ADD CONSTRAINT "perfis_usuarios_whatsapp_check" CHECK ("perfis_usuarios"."whatsapp" is null or "perfis_usuarios"."whatsapp" ~ '^[0-9]{10,15}$');--> statement-breakpoint
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_quantidade_variavel_tolerancia_check" CHECK (("produtos"."quantidade_variavel" = false and "produtos"."tolerancia_quantidade_percentual" is null) or ("produtos"."quantidade_variavel" = true and "produtos"."tolerancia_quantidade_percentual" between 0 and 30));
--> statement-breakpoint
CREATE TRIGGER "fornecedores_produtos_set_atualizado_em"
BEFORE UPDATE ON "fornecedores_produtos"
FOR EACH ROW
EXECUTE FUNCTION set_atualizado_em();
--> statement-breakpoint
CREATE TRIGGER "compras_importacoes_preco_base_set_atualizado_em"
BEFORE UPDATE ON "compras_importacoes_preco_base"
FOR EACH ROW
EXECUTE FUNCTION set_atualizado_em();
--> statement-breakpoint
CREATE TRIGGER "compras_importacoes_preco_base_itens_set_atualizado_em"
BEFORE UPDATE ON "compras_importacoes_preco_base_itens"
FOR EACH ROW
EXECUTE FUNCTION set_atualizado_em();
