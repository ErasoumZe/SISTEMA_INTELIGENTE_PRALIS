CREATE TABLE "clientes" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
  "empresa_id" uuid NOT NULL,
  "nome" text NOT NULL,
  "documento" text,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "importado_de" uuid,
  "id_importado" uuid
);

ALTER TABLE "clientes" ADD CONSTRAINT "clientes_empresa_id_empresas_id_fk"
  FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_importado_de_empresas_id_fk"
  FOREIGN KEY ("importado_de") REFERENCES "public"."empresas"("id") ON DELETE set null ON UPDATE no action;
CREATE UNIQUE INDEX "clientes_empresa_documento_unico_idx"
  ON "clientes" ("empresa_id", lower("documento")) WHERE "documento" is not null;

CREATE TABLE "integracoes_chaves" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
  "empresa_id" uuid NOT NULL,
  "tipo" text NOT NULL,
  "codigo" text NOT NULL,
  "ativa" boolean DEFAULT true NOT NULL,
  "criado_por" text,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "inativado_em" timestamp with time zone,
  CONSTRAINT "integracoes_chaves_codigo_unico" UNIQUE("codigo"),
  CONSTRAINT "integracoes_chaves_tipo_check" CHECK ("integracoes_chaves"."tipo" in ('vendas', 'produtos_vendas'))
);

ALTER TABLE "integracoes_chaves" ADD CONSTRAINT "integracoes_chaves_empresa_id_empresas_id_fk"
  FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;

CREATE TABLE "integracoes_campos_config" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
  "empresa_id" uuid NOT NULL,
  "tipo" text NOT NULL,
  "campo" text NOT NULL,
  "criar_automaticamente" boolean DEFAULT true NOT NULL,
  "vincular_automaticamente" boolean DEFAULT true NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "integracoes_campos_config_empresa_tipo_campo_unico" UNIQUE("empresa_id", "tipo", "campo"),
  CONSTRAINT "integracoes_campos_config_tipo_check" CHECK ("integracoes_campos_config"."tipo" in ('vendas', 'produtos_vendas')),
  CONSTRAINT "integracoes_campos_config_campo_check" CHECK ("integracoes_campos_config"."campo" in ('pdv', 'cliente', 'vendedor', 'produto', 'forma_pagamento'))
);

ALTER TABLE "integracoes_campos_config" ADD CONSTRAINT "integracoes_campos_config_empresa_id_empresas_id_fk"
  FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;

CREATE TABLE "integracoes_vinculos" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
  "empresa_id" uuid NOT NULL,
  "tipo" text NOT NULL,
  "tipo_registro" text NOT NULL,
  "identificador_externo" text NOT NULL,
  "descricao_externa" text,
  "registro_sistema_id" uuid,
  "pendente" boolean DEFAULT true NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "integracoes_vinculos_externo_unico" UNIQUE("empresa_id", "tipo", "tipo_registro", "identificador_externo"),
  CONSTRAINT "integracoes_vinculos_tipo_check" CHECK ("integracoes_vinculos"."tipo" in ('vendas', 'produtos_vendas')),
  CONSTRAINT "integracoes_vinculos_tipo_registro_check" CHECK ("integracoes_vinculos"."tipo_registro" in ('venda', 'pdv', 'cliente', 'colaborador', 'produto', 'forma_pagamento'))
);

ALTER TABLE "integracoes_vinculos" ADD CONSTRAINT "integracoes_vinculos_empresa_id_empresas_id_fk"
  FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;

CREATE TABLE "integracoes_registros" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
  "empresa_id" uuid NOT NULL,
  "integracao_chave_id" uuid NOT NULL,
  "tipo_registro" text NOT NULL,
  "identificador_externo" text NOT NULL,
  "hash_conteudo" text NOT NULL,
  "registro_sistema_id" uuid NOT NULL,
  "payload" jsonb NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "integracoes_registros_externo_unico" UNIQUE("empresa_id", "integracao_chave_id", "tipo_registro", "identificador_externo"),
  CONSTRAINT "integracoes_registros_tipo_registro_check" CHECK ("integracoes_registros"."tipo_registro" in ('venda', 'pdv', 'cliente', 'colaborador', 'produto', 'forma_pagamento'))
);

ALTER TABLE "integracoes_registros" ADD CONSTRAINT "integracoes_registros_empresa_id_empresas_id_fk"
  FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "integracoes_registros" ADD CONSTRAINT "integracoes_registros_integracao_chave_id_integracoes_chaves_id_fk"
  FOREIGN KEY ("integracao_chave_id") REFERENCES "public"."integracoes_chaves"("id") ON DELETE cascade ON UPDATE no action;

CREATE TABLE "integracoes_historico" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
  "empresa_id" uuid NOT NULL,
  "integracao_chave_id" uuid NOT NULL,
  "tipo" text NOT NULL,
  "identificador_externo" text,
  "hash_conteudo" text,
  "status" text NOT NULL,
  "mensagem_erro" text,
  "payload" jsonb NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "integracoes_historico_tipo_check" CHECK ("integracoes_historico"."tipo" in ('vendas', 'produtos_vendas')),
  CONSTRAINT "integracoes_historico_status_check" CHECK ("integracoes_historico"."status" in ('criado', 'atualizado', 'sem_novidade', 'erro'))
);

ALTER TABLE "integracoes_historico" ADD CONSTRAINT "integracoes_historico_empresa_id_empresas_id_fk"
  FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "integracoes_historico" ADD CONSTRAINT "integracoes_historico_integracao_chave_id_integracoes_chaves_id_fk"
  FOREIGN KEY ("integracao_chave_id") REFERENCES "public"."integracoes_chaves"("id") ON DELETE cascade ON UPDATE no action;

CREATE TABLE "integracoes_sem_novidade" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
  "empresa_id" uuid NOT NULL,
  "integracao_chave_id" uuid NOT NULL,
  "tipo" text NOT NULL,
  "identificador_externo" text NOT NULL,
  "hash_conteudo" text NOT NULL,
  "payload" jsonb NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "integracoes_sem_novidade" ADD CONSTRAINT "integracoes_sem_novidade_empresa_id_empresas_id_fk"
  FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "integracoes_sem_novidade" ADD CONSTRAINT "integracoes_sem_novidade_integracao_chave_id_integracoes_chaves_id_fk"
  FOREIGN KEY ("integracao_chave_id") REFERENCES "public"."integracoes_chaves"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "vendas" ADD COLUMN "integracao_chave_id" uuid;
ALTER TABLE "vendas" ADD COLUMN "cliente_id" uuid;
ALTER TABLE "vendas" ADD COLUMN "identificador_externo" text;
ALTER TABLE "vendas" ADD COLUMN "hash_integracao" text;
ALTER TABLE "vendas" ADD COLUMN "status_externo" text;
ALTER TABLE "vendas" ADD COLUMN "numero_nota_fiscal" text;
ALTER TABLE "vendas" ADD COLUMN "pdv_automacao_id" text;
ALTER TABLE "vendas" ADD COLUMN "pdv_automacao" text;
ALTER TABLE "vendas" ADD COLUMN "vendedor_automacao_id" text;
ALTER TABLE "vendas" ADD COLUMN "vendedor_automacao" text;
ALTER TABLE "vendas" ADD COLUMN "vendedor_automacao_documento" text;
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_integracao_chave_id_integracoes_chaves_id_fk"
  FOREIGN KEY ("integracao_chave_id") REFERENCES "public"."integracoes_chaves"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_cliente_id_clientes_id_fk"
  FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;

CREATE TABLE "vendas_produtos" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
  "venda_id" uuid NOT NULL,
  "produto_id" uuid,
  "produto_automacao_id" text,
  "produto_automacao_codigo" text,
  "descricao_produto" text NOT NULL,
  "data_hora_item" timestamp with time zone,
  "quantidade" numeric(14, 3) DEFAULT '0' NOT NULL,
  "valor_unitario" numeric(14, 4) DEFAULT '0' NOT NULL,
  "valor_desconto" numeric(14, 2) DEFAULT '0' NOT NULL,
  "valor_acrescimo" numeric(14, 2) DEFAULT '0' NOT NULL,
  "valor_total" numeric(14, 2) DEFAULT '0' NOT NULL,
  "cancelado" boolean DEFAULT false NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "vendas_produtos_quantidade_check" CHECK ("vendas_produtos"."quantidade" >= 0),
  CONSTRAINT "vendas_produtos_valor_unitario_check" CHECK ("vendas_produtos"."valor_unitario" >= 0),
  CONSTRAINT "vendas_produtos_valor_desconto_check" CHECK ("vendas_produtos"."valor_desconto" >= 0),
  CONSTRAINT "vendas_produtos_valor_acrescimo_check" CHECK ("vendas_produtos"."valor_acrescimo" >= 0),
  CONSTRAINT "vendas_produtos_valor_total_check" CHECK ("vendas_produtos"."valor_total" >= 0)
);

ALTER TABLE "vendas_produtos" ADD CONSTRAINT "vendas_produtos_venda_id_vendas_id_fk"
  FOREIGN KEY ("venda_id") REFERENCES "public"."vendas"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "vendas_produtos" ADD CONSTRAINT "vendas_produtos_produto_id_produtos_id_fk"
  FOREIGN KEY ("produto_id") REFERENCES "public"."produtos"("id") ON DELETE no action ON UPDATE no action;

CREATE TABLE "vendas_pagamentos" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
  "venda_id" uuid NOT NULL,
  "forma_pagamento_id" uuid,
  "tipo_pagamento_automacao_id" text,
  "tipo_pagamento_automacao" text,
  "numero_vendas" integer DEFAULT 0 NOT NULL,
  "total_pago" numeric(14, 2) DEFAULT '0' NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "vendas_pagamentos_numero_vendas_check" CHECK ("vendas_pagamentos"."numero_vendas" >= 0),
  CONSTRAINT "vendas_pagamentos_total_pago_check" CHECK ("vendas_pagamentos"."total_pago" >= 0)
);

ALTER TABLE "vendas_pagamentos" ADD CONSTRAINT "vendas_pagamentos_venda_id_vendas_id_fk"
  FOREIGN KEY ("venda_id") REFERENCES "public"."vendas"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "vendas_pagamentos" ADD CONSTRAINT "vendas_pagamentos_forma_pagamento_id_formas_pagamento_id_fk"
  FOREIGN KEY ("forma_pagamento_id") REFERENCES "public"."formas_pagamento"("id") ON DELETE no action ON UPDATE no action;

INSERT INTO "vendas_produtos" (
  "id", "venda_id", "produto_id", "produto_automacao_id", "produto_automacao_codigo",
  "descricao_produto", "quantidade", "valor_unitario", "valor_total", "criado_em"
)
SELECT
  "id", "venda_id", "produto_id", "produto_automacao_id", "produto_automacao_codigo",
  "descricao_produto", "quantidade", "valor_unitario", "valor_total", "criado_em"
FROM "vendas_itens"
WHERE to_regclass('public.vendas_itens') IS NOT NULL;

INSERT INTO "vendas_pagamentos" (
  "id", "venda_id", "forma_pagamento_id", "tipo_pagamento_automacao_id",
  "tipo_pagamento_automacao", "numero_vendas", "total_pago", "criado_em"
)
SELECT
  "id", "venda_id", "forma_pagamento_id", "tipo_pagamento_automacao_id",
  "tipo_pagamento_automacao", "numero_vendas", "total_pago", "criado_em"
FROM "vendas_tipo_pagamento"
WHERE to_regclass('public.vendas_tipo_pagamento') IS NOT NULL;
