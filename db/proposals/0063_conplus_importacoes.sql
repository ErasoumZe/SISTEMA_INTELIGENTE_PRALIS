-- Proposta de migration Conplus.
-- Não é executada pelo migrator: revisar e autorizar antes de copiar para db/migrations.
-- Não contém DROP, DELETE, TRUNCATE ou alteração de tabelas existentes.

CREATE TABLE "conplus_importacoes" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
  "empresa_id" uuid NOT NULL,
  "tipo" text NOT NULL,
  "competencia" date NOT NULL,
  "nome_arquivo" text NOT NULL,
  "hash_arquivo" text NOT NULL,
  "tamanho_bytes" integer NOT NULL,
  "total_registros" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'previa' NOT NULL,
  "dados_previa" jsonb,
  "sincronizacao_status" text DEFAULT 'nao_iniciada' NOT NULL,
  "ultimo_erro_codigo" text,
  "ultimo_erro_mensagem" text,
  "criado_por" text NOT NULL,
  "confirmado_por" text,
  "confirmado_em" timestamp with time zone,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "conplus_importacoes_empresa_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict,
  CONSTRAINT "conplus_importacoes_criado_por_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE restrict,
  CONSTRAINT "conplus_importacoes_confirmado_por_fk" FOREIGN KEY ("confirmado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE set null,
  CONSTRAINT "conplus_importacoes_empresa_hash_unico" UNIQUE ("empresa_id", "hash_arquivo"),
  CONSTRAINT "conplus_importacoes_id_empresa_unico" UNIQUE ("id", "empresa_id"),
  CONSTRAINT "conplus_importacoes_tipo_check" CHECK ("tipo" IN ('folha_05', 'adiantamento_20', 'rescisoes', 'ferias')),
  CONSTRAINT "conplus_importacoes_status_check" CHECK ("status" IN ('previa', 'confirmada', 'retificada', 'falhou')),
  CONSTRAINT "conplus_importacoes_sincronizacao_status_check" CHECK ("sincronizacao_status" IN ('nao_iniciada', 'pendente', 'processando', 'concluida', 'falhou')),
  CONSTRAINT "conplus_importacoes_tamanho_check" CHECK ("tamanho_bytes" >= 0),
  CONSTRAINT "conplus_importacoes_total_check" CHECK ("total_registros" >= 0)
);
--> statement-breakpoint
CREATE INDEX "conplus_importacoes_empresa_competencia_idx" ON "conplus_importacoes" USING btree ("empresa_id", "competencia", "tipo");
--> statement-breakpoint
CREATE TABLE "conplus_registros" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
  "importacao_id" uuid NOT NULL,
  "empresa_id" uuid NOT NULL,
  "tipo" text NOT NULL,
  "competencia" date NOT NULL,
  "identificador_externo" text NOT NULL,
  "codigo_colaborador" text,
  "nome_colaborador" text,
  "dados" jsonb NOT NULL,
  "status" text DEFAULT 'ativo' NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "conplus_registros_importacao_empresa_fk" FOREIGN KEY ("importacao_id", "empresa_id") REFERENCES "public"."conplus_importacoes"("id", "empresa_id") ON DELETE restrict,
  CONSTRAINT "conplus_registros_importacao_identificador_unico" UNIQUE ("importacao_id", "identificador_externo"),
  CONSTRAINT "conplus_registros_id_importacao_empresa_unico" UNIQUE ("id", "importacao_id", "empresa_id"),
  CONSTRAINT "conplus_registros_status_check" CHECK ("status" IN ('ativo', 'retificado'))
);
--> statement-breakpoint
CREATE INDEX "conplus_registros_empresa_competencia_idx" ON "conplus_registros" USING btree ("empresa_id", "competencia", "tipo");
--> statement-breakpoint
CREATE INDEX "conplus_registros_empresa_colaborador_idx" ON "conplus_registros" USING btree ("empresa_id", "nome_colaborador");
--> statement-breakpoint
CREATE TABLE "conplus_eventos" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
  "registro_id" uuid NOT NULL,
  "importacao_id" uuid NOT NULL,
  "empresa_id" uuid NOT NULL,
  "ordem" integer NOT NULL,
  "codigo" text NOT NULL,
  "unidade" text,
  "natureza" text,
  "referencia" text,
  "valor" numeric(18,4),
  "dados" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "conplus_eventos_registro_importacao_empresa_fk" FOREIGN KEY ("registro_id", "importacao_id", "empresa_id") REFERENCES "public"."conplus_registros"("id", "importacao_id", "empresa_id") ON DELETE cascade,
  CONSTRAINT "conplus_eventos_registro_ordem_unico" UNIQUE ("registro_id", "ordem"),
  CONSTRAINT "conplus_eventos_unidade_check" CHECK ("unidade" IS NULL OR "unidade" IN ('H', 'R', 'V')),
  CONSTRAINT "conplus_eventos_ordem_check" CHECK ("ordem" >= 0)
);
--> statement-breakpoint
CREATE INDEX "conplus_eventos_importacao_idx" ON "conplus_eventos" USING btree ("importacao_id", "empresa_id", "codigo");
--> statement-breakpoint
CREATE TABLE "conplus_importacoes_historico" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
  "importacao_id" uuid NOT NULL,
  "empresa_id" uuid NOT NULL,
  "acao" text NOT NULL,
  "status_anterior" text,
  "status_novo" text,
  "detalhes" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "ator_usuario_id" text,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "conplus_historico_importacao_empresa_fk" FOREIGN KEY ("importacao_id", "empresa_id") REFERENCES "public"."conplus_importacoes"("id", "empresa_id") ON DELETE restrict,
  CONSTRAINT "conplus_historico_ator_fk" FOREIGN KEY ("ator_usuario_id") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX "conplus_historico_importacao_idx" ON "conplus_importacoes_historico" USING btree ("importacao_id", "criado_em");
--> statement-breakpoint
CREATE TABLE "conplus_google_sincronizacoes" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
  "importacao_id" uuid NOT NULL,
  "empresa_id" uuid NOT NULL,
  "aba" text NOT NULL,
  "status" text DEFAULT 'pendente' NOT NULL,
  "linha_inicial" integer,
  "linhas_inseridas" integer DEFAULT 0 NOT NULL,
  "tentativa" integer DEFAULT 0 NOT NULL,
  "bloqueio_token" text,
  "bloqueio_ate" timestamp with time zone,
  "ultimo_erro_codigo" text,
  "ultimo_erro_mensagem" text,
  "iniciado_em" timestamp with time zone,
  "concluido_em" timestamp with time zone,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "conplus_google_importacao_empresa_fk" FOREIGN KEY ("importacao_id", "empresa_id") REFERENCES "public"."conplus_importacoes"("id", "empresa_id") ON DELETE restrict,
  CONSTRAINT "conplus_google_importacao_aba_unica" UNIQUE ("importacao_id", "aba"),
  CONSTRAINT "conplus_google_status_check" CHECK ("status" IN ('pendente', 'processando', 'concluida', 'falhou')),
  CONSTRAINT "conplus_google_tentativa_check" CHECK ("tentativa" >= 0),
  CONSTRAINT "conplus_google_linhas_check" CHECK ("linhas_inseridas" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "conplus_google_bloqueio_unico" ON "conplus_google_sincronizacoes" USING btree ("bloqueio_token") WHERE "bloqueio_token" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "conplus_google_fila_idx" ON "conplus_google_sincronizacoes" USING btree ("status", "bloqueio_ate", "criado_em");
