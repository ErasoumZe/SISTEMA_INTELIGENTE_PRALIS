CREATE TABLE "pdvs" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
  "empresa_id" uuid NOT NULL,
  "nome" text NOT NULL,
  "codigo" text,
  "conta_id" uuid NOT NULL,
  "ativo" boolean DEFAULT true NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "pdvs_empresa_nome_unica" UNIQUE("empresa_id", "nome")
);

ALTER TABLE "pdvs" ADD CONSTRAINT "pdvs_empresa_id_empresas_id_fk"
  FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "pdvs" ADD CONSTRAINT "pdvs_conta_id_contas_id_fk"
  FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE no action ON UPDATE no action;
CREATE UNIQUE INDEX "pdvs_empresa_codigo_unico_idx" ON "pdvs" USING btree ("empresa_id", lower("codigo")) WHERE "codigo" is not null;

ALTER TABLE "fechamentos_caixa" ADD COLUMN "pdv_id" uuid;
ALTER TABLE "fechamentos_caixa" ADD COLUMN "usuario_id" text;
ALTER TABLE "fechamentos_caixa" ADD COLUMN "usuario_caixa_id" text;
ALTER TABLE "fechamentos_caixa" ADD COLUMN "data_hora_abertura" timestamp with time zone;
ALTER TABLE "fechamentos_caixa" ADD COLUMN "aberto_em" timestamp with time zone;
ALTER TABLE "fechamentos_caixa" ADD COLUMN "data_hora_fechamento" timestamp with time zone;
ALTER TABLE "fechamentos_caixa" ADD COLUMN "fechado_em" timestamp with time zone;
ALTER TABLE "fechamentos_caixa" ADD COLUMN "token_edicao" text;
ALTER TABLE "fechamentos_caixa" ADD COLUMN "observacao" text;
ALTER TABLE "fechamentos_caixa" ADD COLUMN "total_transferencias_entrada" numeric(14,2) DEFAULT '0' NOT NULL;
ALTER TABLE "fechamentos_caixa" ADD COLUMN "total_transferencias_saida" numeric(14,2) DEFAULT '0' NOT NULL;
ALTER TABLE "fechamentos_caixa" ADD COLUMN "total_mercadorias" numeric(14,2) DEFAULT '0' NOT NULL;
ALTER TABLE "fechamentos_caixa" ADD CONSTRAINT "fechamentos_caixa_pdv_id_pdvs_id_fk"
  FOREIGN KEY ("pdv_id") REFERENCES "public"."pdvs"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "fechamentos_caixa" ADD CONSTRAINT "fechamentos_caixa_usuario_id_perfis_usuarios_usuario_id_fk"
  FOREIGN KEY ("usuario_id") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "fechamentos_caixa" ADD CONSTRAINT "fechamentos_caixa_usuario_caixa_id_perfis_usuarios_usuario_id_fk"
  FOREIGN KEY ("usuario_caixa_id") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "movimentacoes_financeiras" ADD COLUMN "caixa_id" uuid;
ALTER TABLE "movimentacoes_financeiras" ADD CONSTRAINT "movimentacoes_financeiras_caixa_id_fechamentos_caixa_id_fk"
  FOREIGN KEY ("caixa_id") REFERENCES "public"."fechamentos_caixa"("id") ON DELETE no action ON UPDATE no action;

CREATE TABLE "edicoes_caixa" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
  "caixa_id" uuid NOT NULL,
  "token_usado" text NOT NULL,
  "editado_por" text,
  "editado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "valores_antigos" jsonb NOT NULL,
  "valores_novos" jsonb NOT NULL
);

ALTER TABLE "edicoes_caixa" ADD CONSTRAINT "edicoes_caixa_caixa_id_fechamentos_caixa_id_fk"
  FOREIGN KEY ("caixa_id") REFERENCES "public"."fechamentos_caixa"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "edicoes_caixa" ADD CONSTRAINT "edicoes_caixa_editado_por_perfis_usuarios_usuario_id_fk"
  FOREIGN KEY ("editado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;

CREATE TABLE "debitos_colaboradores" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
  "empresa_id" uuid NOT NULL,
  "colaborador_id" uuid NOT NULL,
  "tipo" text NOT NULL,
  "movimentacao_id" uuid,
  "caixa_id" uuid,
  "valor" numeric(14,2) NOT NULL,
  "observacao" text,
  "criado_por" text,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "debitos_colaboradores_tipo_check" CHECK ("debitos_colaboradores"."tipo" in ('FECHAMENTO_CAIXA', 'DESPESA')),
  CONSTRAINT "debitos_colaboradores_valor_check" CHECK ("debitos_colaboradores"."valor" >= 0)
);

ALTER TABLE "debitos_colaboradores" ADD CONSTRAINT "debitos_colaboradores_empresa_id_empresas_id_fk"
  FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "debitos_colaboradores" ADD CONSTRAINT "debitos_colaboradores_colaborador_id_colaboradores_id_fk"
  FOREIGN KEY ("colaborador_id") REFERENCES "public"."colaboradores"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "debitos_colaboradores" ADD CONSTRAINT "debitos_colaboradores_movimentacao_id_movimentacoes_financeiras_id_fk"
  FOREIGN KEY ("movimentacao_id") REFERENCES "public"."movimentacoes_financeiras"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "debitos_colaboradores" ADD CONSTRAINT "debitos_colaboradores_caixa_id_fechamentos_caixa_id_fk"
  FOREIGN KEY ("caixa_id") REFERENCES "public"."fechamentos_caixa"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "debitos_colaboradores" ADD CONSTRAINT "debitos_colaboradores_criado_por_perfis_usuarios_usuario_id_fk"
  FOREIGN KEY ("criado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;
