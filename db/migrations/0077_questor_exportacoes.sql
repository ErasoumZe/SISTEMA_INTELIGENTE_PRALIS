-- Migration 0068 — exportacoes Questor e eventos variaveis.

CREATE TABLE "questor_exportacoes" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
  "empresa_id" uuid NOT NULL,
  "tipo" text NOT NULL,
  "competencia" date,
  "layout_versao" text NOT NULL,
  "sha256" text NOT NULL,
  "chave_idempotencia" text NOT NULL,
  "resultado" text NOT NULL,
  "nome_arquivo" text,
  "caminho_arquivo" text,
  "diagnosticos" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "gerado_por" text NOT NULL,
  "gerado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "motivo_regeracao" text,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "questor_exportacoes_empresa_fk" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE restrict,
  CONSTRAINT "questor_exportacoes_gerado_por_fk" FOREIGN KEY ("gerado_por") REFERENCES "perfis_usuarios"("usuario_id") ON DELETE restrict,
  CONSTRAINT "questor_exportacoes_id_empresa_unico" UNIQUE ("id", "empresa_id"),
  CONSTRAINT "questor_exportacoes_idempotencia_unica" UNIQUE ("empresa_id", "tipo", "chave_idempotencia"),
  CONSTRAINT "questor_exportacoes_tipo_check" CHECK ("tipo" in ('admissao', 'eventos_variaveis')),
  CONSTRAINT "questor_exportacoes_resultado_check" CHECK ("resultado" in ('previa', 'gerado', 'bloqueado', 'falhou')),
  CONSTRAINT "questor_exportacoes_sha256_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "questor_exportacoes_layout_check" CHECK (length(btrim("layout_versao")) between 1 and 120)
);
--> statement-breakpoint
CREATE INDEX "questor_exportacoes_empresa_tipo_data_idx" ON "questor_exportacoes" ("empresa_id", "tipo", "criado_em");
--> statement-breakpoint
CREATE TABLE "questor_exportacoes_admissoes" (
  "exportacao_id" uuid NOT NULL,
  "processo_id" uuid NOT NULL,
  "empresa_id" uuid NOT NULL,
  CONSTRAINT "questor_exportacoes_admissoes_exportacao_empresa_fk" FOREIGN KEY ("exportacao_id", "empresa_id") REFERENCES "questor_exportacoes"("id", "empresa_id") ON DELETE restrict,
  CONSTRAINT "questor_exportacoes_admissoes_processo_empresa_fk" FOREIGN KEY ("processo_id", "empresa_id") REFERENCES "admissoes_processos"("id", "empresa_id") ON DELETE restrict,
  CONSTRAINT "questor_exportacoes_admissoes_exportacao_processo_unico" UNIQUE ("exportacao_id", "processo_id")
);
--> statement-breakpoint
CREATE INDEX "questor_exportacoes_admissoes_empresa_processo_idx" ON "questor_exportacoes_admissoes" ("empresa_id", "processo_id");
--> statement-breakpoint
CREATE TABLE "questor_eventos_variaveis" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
  "empresa_id" uuid NOT NULL,
  "codigo" text NOT NULL,
  "descricao" text NOT NULL,
  "unidades" text[] NOT NULL,
  "ativo" boolean DEFAULT true NOT NULL,
  "criado_por" text NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "questor_eventos_variaveis_empresa_fk" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE restrict,
  CONSTRAINT "questor_eventos_variaveis_criado_por_fk" FOREIGN KEY ("criado_por") REFERENCES "perfis_usuarios"("usuario_id") ON DELETE restrict,
  CONSTRAINT "questor_eventos_variaveis_id_empresa_unico" UNIQUE ("id", "empresa_id"),
  CONSTRAINT "questor_eventos_variaveis_empresa_codigo_unico" UNIQUE ("empresa_id", "codigo"),
  CONSTRAINT "questor_eventos_variaveis_codigo_check" CHECK ("codigo" ~ '^[0-9]+$'),
  CONSTRAINT "questor_eventos_variaveis_descricao_check" CHECK (length(btrim("descricao")) between 1 and 200),
  CONSTRAINT "questor_eventos_variaveis_unidades_check" CHECK (cardinality("unidades") > 0 and "unidades" <@ array['H','R','V']::text[])
);
--> statement-breakpoint
CREATE INDEX "questor_eventos_variaveis_empresa_ativo_idx" ON "questor_eventos_variaveis" ("empresa_id", "ativo", "codigo");
--> statement-breakpoint
CREATE TABLE "questor_eventos_variaveis_lancamentos" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
  "empresa_id" uuid NOT NULL,
  "competencia" date NOT NULL,
  "vinculo_id" uuid NOT NULL,
  "evento_id" uuid NOT NULL,
  "unidade" text NOT NULL,
  "valor" numeric(18,4) NOT NULL,
  "origem" text DEFAULT 'manual' NOT NULL,
  "criado_por" text NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "questor_eventos_variaveis_lancamentos_vinculo_empresa_fk" FOREIGN KEY ("vinculo_id", "empresa_id") REFERENCES "colaboradores_vinculos"("id", "empresa_id") ON DELETE restrict,
  CONSTRAINT "questor_eventos_variaveis_lancamentos_evento_empresa_fk" FOREIGN KEY ("evento_id", "empresa_id") REFERENCES "questor_eventos_variaveis"("id", "empresa_id") ON DELETE restrict,
  CONSTRAINT "questor_eventos_variaveis_lancamentos_criado_por_fk" FOREIGN KEY ("criado_por") REFERENCES "perfis_usuarios"("usuario_id") ON DELETE restrict,
  CONSTRAINT "questor_eventos_variaveis_lancamentos_unico" UNIQUE ("empresa_id", "competencia", "vinculo_id", "evento_id"),
  CONSTRAINT "questor_eventos_variaveis_lancamentos_id_empresa_unico" UNIQUE ("id", "empresa_id"),
  CONSTRAINT "questor_eventos_variaveis_lancamentos_unidade_check" CHECK ("unidade" in ('H', 'R', 'V')),
  CONSTRAINT "questor_eventos_variaveis_lancamentos_valor_check" CHECK ("valor" >= 0),
  CONSTRAINT "questor_eventos_variaveis_lancamentos_origem_check" CHECK ("origem" in ('manual', 'importacao'))
);
--> statement-breakpoint
CREATE INDEX "questor_eventos_variaveis_lancamentos_empresa_competencia_idx" ON "questor_eventos_variaveis_lancamentos" ("empresa_id", "competencia");
--> statement-breakpoint
CREATE TABLE "questor_exportacoes_eventos_variaveis" (
  "exportacao_id" uuid NOT NULL,
  "lancamento_id" uuid NOT NULL,
  "empresa_id" uuid NOT NULL,
  CONSTRAINT "questor_exportacoes_eventos_exportacao_empresa_fk" FOREIGN KEY ("exportacao_id", "empresa_id") REFERENCES "questor_exportacoes"("id", "empresa_id") ON DELETE restrict,
  CONSTRAINT "questor_exportacoes_eventos_lancamento_empresa_fk" FOREIGN KEY ("lancamento_id", "empresa_id") REFERENCES "questor_eventos_variaveis_lancamentos"("id", "empresa_id") ON DELETE restrict,
  CONSTRAINT "questor_exportacoes_eventos_exportacao_lancamento_unico" UNIQUE ("exportacao_id", "lancamento_id")
);
--> statement-breakpoint
CREATE INDEX "questor_exportacoes_eventos_empresa_idx" ON "questor_exportacoes_eventos_variaveis" ("empresa_id", "exportacao_id");


