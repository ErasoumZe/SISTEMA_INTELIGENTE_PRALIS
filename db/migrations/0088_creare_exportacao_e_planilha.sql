CREATE TABLE "creare_exportacao_confirmacoes" (
	"empresa_id" uuid NOT NULL,
	"produto_id" uuid NOT NULL,
	"hash" text NOT NULL,
	"lote_id" uuid NOT NULL,
	"confirmado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creare_exportacao_confirmacoes_empresa_id_produto_id_pk" PRIMARY KEY("empresa_id","produto_id"),
	CONSTRAINT "creare_exportacao_confirmacoes_hash_check" CHECK ("creare_exportacao_confirmacoes"."hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "creare_exportacao_entregas" (
	"empresa_id" uuid NOT NULL,
	"produto_id" uuid NOT NULL,
	"hash" text NOT NULL,
	"lote_id" uuid NOT NULL,
	"entregue_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creare_exportacao_entregas_empresa_id_produto_id_pk" PRIMARY KEY("empresa_id","produto_id"),
	CONSTRAINT "creare_exportacao_entregas_hash_check" CHECK ("creare_exportacao_entregas"."hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "creare_exportacao_lotes" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"conteudo" text NOT NULL,
	"sha256" text NOT NULL,
	"itens" jsonb NOT NULL,
	"formato_versao" integer DEFAULT 1 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"entregue_em" timestamp with time zone,
	"confirmado_em" timestamp with time zone,
	"cancelado_em" timestamp with time zone,
	CONSTRAINT "creare_exportacao_lotes_id_empresa_unico" UNIQUE("id","empresa_id"),
	CONSTRAINT "creare_exportacao_lotes_sha256_check" CHECK ("creare_exportacao_lotes"."sha256" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "creare_exportacao_lotes_itens_check" CHECK (jsonb_typeof("creare_exportacao_lotes"."itens") = 'array' and jsonb_array_length("creare_exportacao_lotes"."itens") > 0),
	CONSTRAINT "creare_exportacao_lotes_conteudo_check" CHECK (length("creare_exportacao_lotes"."conteudo") > 0),
	CONSTRAINT "creare_exportacao_lotes_formato_versao_check" CHECK ("creare_exportacao_lotes"."formato_versao" >= 1)
);
--> statement-breakpoint
CREATE TABLE "produtos_planilha_sincronizacoes" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid,
	"produto_id" uuid,
	"produto_base_id" uuid,
	"planilha_id" text NOT NULL,
	"aba" text NOT NULL,
	"linha" integer,
	"status" text DEFAULT 'pendente' NOT NULL,
	"tentativas" integer DEFAULT 0 NOT NULL,
	"ultimo_erro" text,
	"proxima_tentativa_em" timestamp with time zone,
	"sincronizado_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "produtos_planilha_sincronizacoes_status_check" CHECK ("produtos_planilha_sincronizacoes"."status" in ('pendente', 'sincronizado', 'falhou')),
	CONSTRAINT "produtos_planilha_sincronizacoes_tentativas_check" CHECK ("produtos_planilha_sincronizacoes"."tentativas" >= 0),
	CONSTRAINT "produtos_planilha_sincronizacoes_linha_check" CHECK ("produtos_planilha_sincronizacoes"."linha" is null or "produtos_planilha_sincronizacoes"."linha" > 0),
	CONSTRAINT "produtos_planilha_sincronizacoes_alvo_check" CHECK (("produtos_planilha_sincronizacoes"."empresa_id" is null and "produtos_planilha_sincronizacoes"."produto_base_id" is not null and "produtos_planilha_sincronizacoes"."produto_id" is null) or ("produtos_planilha_sincronizacoes"."empresa_id" is not null and "produtos_planilha_sincronizacoes"."produto_id" is not null and "produtos_planilha_sincronizacoes"."produto_base_id" is null))
);
--> statement-breakpoint
ALTER TABLE "creare_exportacao_confirmacoes" ADD CONSTRAINT "creare_exportacao_confirmacoes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creare_exportacao_confirmacoes" ADD CONSTRAINT "creare_exportacao_confirmacoes_produto_mesma_empresa_fk" FOREIGN KEY ("produto_id","empresa_id") REFERENCES "public"."produtos"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creare_exportacao_confirmacoes" ADD CONSTRAINT "creare_exportacao_confirmacoes_lote_mesma_empresa_fk" FOREIGN KEY ("lote_id","empresa_id") REFERENCES "public"."creare_exportacao_lotes"("id","empresa_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creare_exportacao_entregas" ADD CONSTRAINT "creare_exportacao_entregas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creare_exportacao_entregas" ADD CONSTRAINT "creare_exportacao_entregas_produto_mesma_empresa_fk" FOREIGN KEY ("produto_id","empresa_id") REFERENCES "public"."produtos"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creare_exportacao_entregas" ADD CONSTRAINT "creare_exportacao_entregas_lote_mesma_empresa_fk" FOREIGN KEY ("lote_id","empresa_id") REFERENCES "public"."creare_exportacao_lotes"("id","empresa_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creare_exportacao_lotes" ADD CONSTRAINT "creare_exportacao_lotes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produtos_planilha_sincronizacoes" ADD CONSTRAINT "produtos_planilha_sincronizacoes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produtos_planilha_sincronizacoes" ADD CONSTRAINT "produtos_planilha_sincronizacoes_produto_mesma_empresa_fk" FOREIGN KEY ("produto_id","empresa_id") REFERENCES "public"."produtos"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produtos_planilha_sincronizacoes" ADD CONSTRAINT "produtos_planilha_sincronizacoes_base_fk" FOREIGN KEY ("produto_base_id") REFERENCES "public"."produtos_catalogo_base"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "creare_exportacao_confirmacoes_lote_idx" ON "creare_exportacao_confirmacoes" USING btree ("lote_id");--> statement-breakpoint
CREATE INDEX "creare_exportacao_entregas_lote_idx" ON "creare_exportacao_entregas" USING btree ("lote_id");--> statement-breakpoint
CREATE UNIQUE INDEX "creare_exportacao_lotes_aberto_uidx" ON "creare_exportacao_lotes" USING btree ("empresa_id") WHERE "creare_exportacao_lotes"."entregue_em" is null and "creare_exportacao_lotes"."confirmado_em" is null and "creare_exportacao_lotes"."cancelado_em" is null;--> statement-breakpoint
CREATE INDEX "creare_exportacao_lotes_empresa_criado_idx" ON "creare_exportacao_lotes" USING btree ("empresa_id","criado_em");--> statement-breakpoint
CREATE UNIQUE INDEX "produtos_planilha_sincronizacoes_produto_uidx" ON "produtos_planilha_sincronizacoes" USING btree ("produto_id") WHERE "produtos_planilha_sincronizacoes"."produto_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "produtos_planilha_sincronizacoes_produto_base_uidx" ON "produtos_planilha_sincronizacoes" USING btree ("produto_base_id") WHERE "produtos_planilha_sincronizacoes"."produto_base_id" is not null;--> statement-breakpoint
CREATE INDEX "produtos_planilha_sincronizacoes_fila_idx" ON "produtos_planilha_sincronizacoes" USING btree ("status","proxima_tentativa_em","atualizado_em");