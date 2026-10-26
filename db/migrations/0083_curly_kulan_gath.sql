CREATE TABLE "produtos_central_cargas" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"estado" text DEFAULT 'recebida' NOT NULL,
	"manifesto" jsonb NOT NULL,
	"resumo" jsonb,
	"criado_por" text,
	"criado_por_nome" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"validado_em" timestamp with time zone,
	"ativado_em" timestamp with time zone,
	CONSTRAINT "produtos_central_cargas_estado_check" CHECK ("produtos_central_cargas"."estado" in ('recebida', 'validando', 'validada', 'ativa', 'substituida', 'falhou'))
);
--> statement-breakpoint
CREATE TABLE "produtos_central_decisoes" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"chave_grupo" text NOT NULL,
	"acao" text NOT NULL,
	"produto_id" uuid,
	"detalhe" jsonb NOT NULL,
	"usuario_id" text,
	"usuario_nome" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "produtos_central_decisoes_acao_check" CHECK ("produtos_central_decisoes"."acao" in ('unificado', 'criado', 'nao_e_o_mesmo', 'ignorado'))
);
--> statement-breakpoint
CREATE TABLE "produtos_central_fontes" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"carga_id" uuid NOT NULL,
	"fonte" text NOT NULL,
	"loja_fonte" text NOT NULL,
	"chave_linha_fonte" text NOT NULL,
	"id_sistema" text,
	"codigo_interno" text DEFAULT '' NOT NULL,
	"codigo_barras" text DEFAULT '' NOT NULL,
	"chave_barras" text DEFAULT '' NOT NULL,
	"nome" text DEFAULT '' NOT NULL,
	"nome_normalizado" text DEFAULT '' NOT NULL,
	"ativo" boolean,
	"grupo" text,
	"custo" text,
	"venda" text,
	"fiscal" jsonb,
	"dados_originais" jsonb NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "produtos_central_fontes_fonte_check" CHECK ("produtos_central_fontes"."fonte" in ('sia_li', 'compilart_tnp', 'planilha_tnp', 'fiscal_tnp', 'planilha_nova', 'vendidos_tnp', 'pralis', 'vendas_pdv_12m')),
	CONSTRAINT "produtos_central_fontes_loja_check" CHECK ("produtos_central_fontes"."loja_fonte" in ('LI', 'TNP', 'BASE', 'HORA'))
);
--> statement-breakpoint
CREATE TABLE "produtos_central_grupos" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"carga_id" uuid NOT NULL,
	"chave" text NOT NULL,
	"motivo" text NOT NULL,
	"fontes" text[] NOT NULL,
	"lojas" text[] NOT NULL,
	"candidato" jsonb NOT NULL,
	"nome" text DEFAULT '' NOT NULL,
	"nome_normalizado" text DEFAULT '' NOT NULL,
	"ativo" boolean DEFAULT false NOT NULL,
	"alerta_nome_divergente" boolean DEFAULT false NOT NULL,
	"alerta_barras_conflitantes" boolean DEFAULT false NOT NULL,
	"alerta_sem_barras" boolean DEFAULT false NOT NULL,
	"alerta_sem_fiscal_tnp" boolean DEFAULT false NOT NULL,
	"alerta_sem_grupo" boolean DEFAULT false NOT NULL,
	"alerta_ja_na_base" boolean DEFAULT false NOT NULL,
	"calculado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "produtos_central_grupos_motivo_check" CHECK ("produtos_central_grupos"."motivo" in ('mesmo_id_sistema', 'mesmo_cod_barras', 'mesmo_cod_interno', 'nome_parecido', 'unico'))
);
--> statement-breakpoint
CREATE TABLE "produtos_central_grupos_fontes" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"carga_id" uuid NOT NULL,
	"grupo_id" uuid NOT NULL,
	"fonte_produto_id" uuid NOT NULL,
	"fonte" text NOT NULL,
	"loja_fonte" text NOT NULL,
	CONSTRAINT "produtos_central_grupos_fontes_loja_check" CHECK ("produtos_central_grupos_fontes"."loja_fonte" in ('LI', 'TNP', 'BASE', 'HORA'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "produtos_central_fontes_id_carga_unico" ON "produtos_central_fontes" USING btree ("id","carga_id");--> statement-breakpoint
CREATE UNIQUE INDEX "produtos_central_grupos_id_carga_unico" ON "produtos_central_grupos" USING btree ("id","carga_id");--> statement-breakpoint
ALTER TABLE "produtos_central_cargas" ADD CONSTRAINT "produtos_central_cargas_criado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produtos_central_decisoes" ADD CONSTRAINT "produtos_central_decisoes_usuario_id_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produtos_central_fontes" ADD CONSTRAINT "produtos_central_fontes_carga_id_produtos_central_cargas_id_fk" FOREIGN KEY ("carga_id") REFERENCES "public"."produtos_central_cargas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produtos_central_grupos" ADD CONSTRAINT "produtos_central_grupos_carga_id_produtos_central_cargas_id_fk" FOREIGN KEY ("carga_id") REFERENCES "public"."produtos_central_cargas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produtos_central_grupos_fontes" ADD CONSTRAINT "produtos_central_grupos_fontes_grupo_id_carga_id_produtos_central_grupos_id_carga_id_fk" FOREIGN KEY ("grupo_id","carga_id") REFERENCES "public"."produtos_central_grupos"("id","carga_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produtos_central_grupos_fontes" ADD CONSTRAINT "produtos_central_grupos_fontes_fonte_produto_id_carga_id_produtos_central_fontes_id_carga_id_fk" FOREIGN KEY ("fonte_produto_id","carga_id") REFERENCES "public"."produtos_central_fontes"("id","carga_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "produtos_central_cargas_estado_data_idx" ON "produtos_central_cargas" USING btree ("estado","criado_em");--> statement-breakpoint
CREATE INDEX "produtos_central_decisoes_chave_data_idx" ON "produtos_central_decisoes" USING btree ("chave_grupo","criado_em");--> statement-breakpoint
CREATE INDEX "produtos_central_decisoes_produto_idx" ON "produtos_central_decisoes" USING btree ("produto_id");--> statement-breakpoint
CREATE UNIQUE INDEX "produtos_central_fontes_carga_fonte_chave_unico" ON "produtos_central_fontes" USING btree ("carga_id","fonte","chave_linha_fonte");--> statement-breakpoint
CREATE INDEX "produtos_central_fontes_carga_barras_idx" ON "produtos_central_fontes" USING btree ("carga_id","chave_barras");--> statement-breakpoint
CREATE INDEX "produtos_central_fontes_carga_nome_idx" ON "produtos_central_fontes" USING btree ("carga_id","nome_normalizado");--> statement-breakpoint
CREATE INDEX "produtos_central_fontes_carga_loja_interno_idx" ON "produtos_central_fontes" USING btree ("carga_id","loja_fonte","codigo_interno");--> statement-breakpoint
CREATE UNIQUE INDEX "produtos_central_grupos_carga_chave_unico" ON "produtos_central_grupos" USING btree ("carga_id","chave");--> statement-breakpoint
CREATE INDEX "produtos_central_grupos_carga_motivo_idx" ON "produtos_central_grupos" USING btree ("carga_id","motivo");--> statement-breakpoint
CREATE INDEX "produtos_central_grupos_carga_nome_idx" ON "produtos_central_grupos" USING btree ("carga_id","nome_normalizado");--> statement-breakpoint
CREATE UNIQUE INDEX "produtos_central_grupo_fonte_unico" ON "produtos_central_grupos_fontes" USING btree ("grupo_id","fonte_produto_id");--> statement-breakpoint
CREATE INDEX "produtos_central_grupos_fontes_carga_loja_idx" ON "produtos_central_grupos_fontes" USING btree ("carga_id","loja_fonte","grupo_id");
