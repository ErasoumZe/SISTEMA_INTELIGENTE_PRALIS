CREATE TABLE "formas_pagamento" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
  "empresa_id" uuid NOT NULL,
  "nome" text NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "importado_de" uuid,
  "id_importado" uuid,
  CONSTRAINT "formas_pagamento_empresa_nome_unica" UNIQUE("empresa_id", "nome")
);

ALTER TABLE "formas_pagamento" ADD CONSTRAINT "formas_pagamento_empresa_id_empresas_id_fk"
  FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "formas_pagamento" ADD CONSTRAINT "formas_pagamento_importado_de_empresas_id_fk"
  FOREIGN KEY ("importado_de") REFERENCES "public"."empresas"("id") ON DELETE set null ON UPDATE no action;

CREATE TABLE "vendas" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
  "empresa_id" uuid NOT NULL,
  "caixa_id" uuid,
  "data_referencia" date NOT NULL,
  "data_venda" timestamp with time zone,
  "descricao" text NOT NULL,
  "observacao" text,
  "valor_original" numeric(14, 2) NOT NULL,
  "valor_acrescimo" numeric(14, 2) DEFAULT '0' NOT NULL,
  "descricao_acrescimo" text,
  "valor_desconto" numeric(14, 2) DEFAULT '0' NOT NULL,
  "descricao_desconto" text,
  "data_pagamento" date,
  "conta_origem_id" uuid,
  "pdv_id" uuid,
  "colaborador_id" uuid,
  "cliente_automacao_id" text,
  "cliente_automacao" text,
  "cliente_automacao_documento" text,
  "automacao_id" text,
  "computar" boolean DEFAULT true NOT NULL,
  "status" text DEFAULT 'aprovado' NOT NULL,
  "criado_por" text,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "vendas_status_check" CHECK ("vendas"."status" in ('aprovado', 'aguardando_aprovacao', 'cancelado')),
  CONSTRAINT "vendas_valor_original_check" CHECK ("vendas"."valor_original" >= 0),
  CONSTRAINT "vendas_valor_acrescimo_check" CHECK ("vendas"."valor_acrescimo" >= 0),
  CONSTRAINT "vendas_valor_desconto_check" CHECK ("vendas"."valor_desconto" >= 0)
);

ALTER TABLE "vendas" ADD CONSTRAINT "vendas_empresa_id_empresas_id_fk"
  FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_caixa_id_fechamentos_caixa_id_fk"
  FOREIGN KEY ("caixa_id") REFERENCES "public"."fechamentos_caixa"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_conta_origem_id_contas_id_fk"
  FOREIGN KEY ("conta_origem_id") REFERENCES "public"."contas"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_pdv_id_pdvs_id_fk"
  FOREIGN KEY ("pdv_id") REFERENCES "public"."pdvs"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_colaborador_id_colaboradores_id_fk"
  FOREIGN KEY ("colaborador_id") REFERENCES "public"."colaboradores"("id") ON DELETE no action ON UPDATE no action;

CREATE TABLE "vendas_itens" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
  "venda_id" uuid NOT NULL,
  "produto_id" uuid,
  "produto_automacao_id" text,
  "produto_automacao_codigo" text,
  "descricao_produto" text NOT NULL,
  "quantidade" numeric(14, 3) DEFAULT '0' NOT NULL,
  "valor_unitario" numeric(14, 4) DEFAULT '0' NOT NULL,
  "valor_total" numeric(14, 2) DEFAULT '0' NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "vendas_itens_quantidade_check" CHECK ("vendas_itens"."quantidade" >= 0),
  CONSTRAINT "vendas_itens_valor_unitario_check" CHECK ("vendas_itens"."valor_unitario" >= 0),
  CONSTRAINT "vendas_itens_valor_total_check" CHECK ("vendas_itens"."valor_total" >= 0)
);

ALTER TABLE "vendas_itens" ADD CONSTRAINT "vendas_itens_venda_id_vendas_id_fk"
  FOREIGN KEY ("venda_id") REFERENCES "public"."vendas"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "vendas_itens" ADD CONSTRAINT "vendas_itens_produto_id_produtos_id_fk"
  FOREIGN KEY ("produto_id") REFERENCES "public"."produtos"("id") ON DELETE no action ON UPDATE no action;

CREATE TABLE "vendas_tipo_pagamento" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
  "venda_id" uuid NOT NULL,
  "forma_pagamento_id" uuid,
  "tipo_pagamento_automacao_id" text,
  "tipo_pagamento_automacao" text,
  "numero_vendas" integer DEFAULT 0 NOT NULL,
  "total_pago" numeric(14, 2) DEFAULT '0' NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "vendas_tipo_pagamento_numero_vendas_check" CHECK ("vendas_tipo_pagamento"."numero_vendas" >= 0),
  CONSTRAINT "vendas_tipo_pagamento_total_pago_check" CHECK ("vendas_tipo_pagamento"."total_pago" >= 0)
);

ALTER TABLE "vendas_tipo_pagamento" ADD CONSTRAINT "vendas_tipo_pagamento_venda_id_vendas_id_fk"
  FOREIGN KEY ("venda_id") REFERENCES "public"."vendas"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "vendas_tipo_pagamento" ADD CONSTRAINT "vendas_tipo_pagamento_forma_pagamento_id_formas_pagamento_id_fk"
  FOREIGN KEY ("forma_pagamento_id") REFERENCES "public"."formas_pagamento"("id") ON DELETE no action ON UPDATE no action;

CREATE TABLE "despesas" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
  "empresa_id" uuid NOT NULL,
  "caixa_id" uuid,
  "grupo_despesa_id" uuid,
  "fornecedor_id" uuid,
  "colaborador_id" uuid,
  "data_referencia" date NOT NULL,
  "data_vencimento" date NOT NULL,
  "data_pagamento" date,
  "descricao" text NOT NULL,
  "observacao" text,
  "valor_original" numeric(14, 2) NOT NULL,
  "valor_acrescimo" numeric(14, 2) DEFAULT '0' NOT NULL,
  "descricao_acrescimo" text,
  "valor_desconto" numeric(14, 2) DEFAULT '0' NOT NULL,
  "descricao_desconto" text,
  "conta_origem_id" uuid,
  "computar" boolean DEFAULT true NOT NULL,
  "foto_documento_url" text,
  "status" text DEFAULT 'aprovado' NOT NULL,
  "criado_por" text,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "despesas_status_check" CHECK ("despesas"."status" in ('aprovado', 'aguardando_aprovacao', 'cancelado')),
  CONSTRAINT "despesas_valor_original_check" CHECK ("despesas"."valor_original" >= 0),
  CONSTRAINT "despesas_valor_acrescimo_check" CHECK ("despesas"."valor_acrescimo" >= 0),
  CONSTRAINT "despesas_valor_desconto_check" CHECK ("despesas"."valor_desconto" >= 0)
);

ALTER TABLE "despesas" ADD CONSTRAINT "despesas_empresa_id_empresas_id_fk"
  FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "despesas" ADD CONSTRAINT "despesas_caixa_id_fechamentos_caixa_id_fk"
  FOREIGN KEY ("caixa_id") REFERENCES "public"."fechamentos_caixa"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "despesas" ADD CONSTRAINT "despesas_grupo_despesa_id_grupos_despesas_id_fk"
  FOREIGN KEY ("grupo_despesa_id") REFERENCES "public"."grupos_despesas"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "despesas" ADD CONSTRAINT "despesas_fornecedor_id_fornecedores_id_fk"
  FOREIGN KEY ("fornecedor_id") REFERENCES "public"."fornecedores"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "despesas" ADD CONSTRAINT "despesas_colaborador_id_colaboradores_id_fk"
  FOREIGN KEY ("colaborador_id") REFERENCES "public"."colaboradores"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "despesas" ADD CONSTRAINT "despesas_conta_origem_id_contas_id_fk"
  FOREIGN KEY ("conta_origem_id") REFERENCES "public"."contas"("id") ON DELETE no action ON UPDATE no action;

CREATE TABLE "despesas_itens" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
  "despesa_id" uuid NOT NULL,
  "grupo_despesa_id" uuid,
  "colaborador_id" uuid,
  "descricao" text NOT NULL,
  "valor" numeric(14, 2) NOT NULL,
  CONSTRAINT "despesas_itens_valor_check" CHECK ("despesas_itens"."valor" >= 0)
);

ALTER TABLE "despesas_itens" ADD CONSTRAINT "despesas_itens_despesa_id_despesas_id_fk"
  FOREIGN KEY ("despesa_id") REFERENCES "public"."despesas"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "despesas_itens" ADD CONSTRAINT "despesas_itens_grupo_despesa_id_grupos_despesas_id_fk"
  FOREIGN KEY ("grupo_despesa_id") REFERENCES "public"."grupos_despesas"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "despesas_itens" ADD CONSTRAINT "despesas_itens_colaborador_id_colaboradores_id_fk"
  FOREIGN KEY ("colaborador_id") REFERENCES "public"."colaboradores"("id") ON DELETE no action ON UPDATE no action;

CREATE TABLE "mercadorias" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
  "empresa_id" uuid NOT NULL,
  "caixa_id" uuid,
  "grupo_mercadoria_id" uuid,
  "fornecedor_id" uuid,
  "data_referencia" date NOT NULL,
  "data_vencimento" date NOT NULL,
  "data_pagamento" date,
  "descricao" text NOT NULL,
  "observacao" text,
  "valor_original" numeric(14, 2) NOT NULL,
  "valor_acrescimo" numeric(14, 2) DEFAULT '0' NOT NULL,
  "descricao_acrescimo" text,
  "valor_desconto" numeric(14, 2) DEFAULT '0' NOT NULL,
  "descricao_desconto" text,
  "conta_origem_id" uuid,
  "nota_fiscal_id" text,
  "tem_nota_fiscal" boolean DEFAULT false NOT NULL,
  "computar" boolean DEFAULT true NOT NULL,
  "foto_documento_url" text,
  "status" text DEFAULT 'aprovado' NOT NULL,
  "criado_por" text,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "mercadorias_status_check" CHECK ("mercadorias"."status" in ('aprovado', 'aguardando_aprovacao', 'cancelado')),
  CONSTRAINT "mercadorias_valor_original_check" CHECK ("mercadorias"."valor_original" >= 0),
  CONSTRAINT "mercadorias_valor_acrescimo_check" CHECK ("mercadorias"."valor_acrescimo" >= 0),
  CONSTRAINT "mercadorias_valor_desconto_check" CHECK ("mercadorias"."valor_desconto" >= 0)
);

ALTER TABLE "mercadorias" ADD CONSTRAINT "mercadorias_empresa_id_empresas_id_fk"
  FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "mercadorias" ADD CONSTRAINT "mercadorias_caixa_id_fechamentos_caixa_id_fk"
  FOREIGN KEY ("caixa_id") REFERENCES "public"."fechamentos_caixa"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "mercadorias" ADD CONSTRAINT "mercadorias_grupo_mercadoria_id_grupos_mercadorias_id_fk"
  FOREIGN KEY ("grupo_mercadoria_id") REFERENCES "public"."grupos_mercadorias"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "mercadorias" ADD CONSTRAINT "mercadorias_fornecedor_id_fornecedores_id_fk"
  FOREIGN KEY ("fornecedor_id") REFERENCES "public"."fornecedores"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "mercadorias" ADD CONSTRAINT "mercadorias_conta_origem_id_contas_id_fk"
  FOREIGN KEY ("conta_origem_id") REFERENCES "public"."contas"("id") ON DELETE no action ON UPDATE no action;

CREATE TABLE "mercadorias_itens" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
  "mercadoria_id" uuid NOT NULL,
  "produto_id" uuid,
  "grupo_mercadoria_id" uuid,
  "unidade_medida_id" uuid,
  "descricao" text NOT NULL,
  "quantidade" numeric(14, 3) NOT NULL,
  "valor_unitario" numeric(14, 4) DEFAULT '0' NOT NULL,
  "valor_total" numeric(14, 2) NOT NULL,
  CONSTRAINT "mercadorias_itens_quantidade_check" CHECK ("mercadorias_itens"."quantidade" > 0),
  CONSTRAINT "mercadorias_itens_valor_total_check" CHECK ("mercadorias_itens"."valor_total" >= 0)
);

ALTER TABLE "mercadorias_itens" ADD CONSTRAINT "mercadorias_itens_mercadoria_id_mercadorias_id_fk"
  FOREIGN KEY ("mercadoria_id") REFERENCES "public"."mercadorias"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "mercadorias_itens" ADD CONSTRAINT "mercadorias_itens_produto_id_produtos_id_fk"
  FOREIGN KEY ("produto_id") REFERENCES "public"."produtos"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "mercadorias_itens" ADD CONSTRAINT "mercadorias_itens_grupo_mercadoria_id_grupos_mercadorias_id_fk"
  FOREIGN KEY ("grupo_mercadoria_id") REFERENCES "public"."grupos_mercadorias"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "mercadorias_itens" ADD CONSTRAINT "mercadorias_itens_unidade_medida_id_unidades_medida_id_fk"
  FOREIGN KEY ("unidade_medida_id") REFERENCES "public"."unidades_medida"("id") ON DELETE no action ON UPDATE no action;

CREATE TABLE "retiradas" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
  "empresa_id" uuid NOT NULL,
  "caixa_id" uuid,
  "grupo_retirada_id" uuid,
  "colaborador_id" uuid NOT NULL,
  "data_referencia" date NOT NULL,
  "data_vencimento" date NOT NULL,
  "data_pagamento" date,
  "descricao" text NOT NULL,
  "observacao" text,
  "valor_original" numeric(14, 2) NOT NULL,
  "valor_acrescimo" numeric(14, 2) DEFAULT '0' NOT NULL,
  "descricao_acrescimo" text,
  "valor_desconto" numeric(14, 2) DEFAULT '0' NOT NULL,
  "descricao_desconto" text,
  "conta_origem_id" uuid,
  "computar" boolean DEFAULT true NOT NULL,
  "status" text DEFAULT 'aprovado' NOT NULL,
  "criado_por" text,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "retiradas_status_check" CHECK ("retiradas"."status" in ('aprovado', 'aguardando_aprovacao', 'cancelado')),
  CONSTRAINT "retiradas_valor_original_check" CHECK ("retiradas"."valor_original" >= 0),
  CONSTRAINT "retiradas_valor_acrescimo_check" CHECK ("retiradas"."valor_acrescimo" >= 0),
  CONSTRAINT "retiradas_valor_desconto_check" CHECK ("retiradas"."valor_desconto" >= 0)
);

ALTER TABLE "retiradas" ADD CONSTRAINT "retiradas_empresa_id_empresas_id_fk"
  FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "retiradas" ADD CONSTRAINT "retiradas_caixa_id_fechamentos_caixa_id_fk"
  FOREIGN KEY ("caixa_id") REFERENCES "public"."fechamentos_caixa"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "retiradas" ADD CONSTRAINT "retiradas_grupo_retirada_id_grupos_retiradas_id_fk"
  FOREIGN KEY ("grupo_retirada_id") REFERENCES "public"."grupos_retiradas"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "retiradas" ADD CONSTRAINT "retiradas_colaborador_id_colaboradores_id_fk"
  FOREIGN KEY ("colaborador_id") REFERENCES "public"."colaboradores"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "retiradas" ADD CONSTRAINT "retiradas_conta_origem_id_contas_id_fk"
  FOREIGN KEY ("conta_origem_id") REFERENCES "public"."contas"("id") ON DELETE no action ON UPDATE no action;

CREATE TABLE "transferencias" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
  "empresa_id" uuid NOT NULL,
  "caixa_id" uuid,
  "data_referencia" date NOT NULL,
  "descricao" text NOT NULL,
  "observacao" text,
  "valor_original" numeric(14, 2) NOT NULL,
  "valor_acrescimo" numeric(14, 2) DEFAULT '0' NOT NULL,
  "descricao_acrescimo" text,
  "valor_desconto" numeric(14, 2) DEFAULT '0' NOT NULL,
  "descricao_desconto" text,
  "conta_origem_id" uuid NOT NULL,
  "conta_destino_id" uuid NOT NULL,
  "malote_id" uuid,
  "lacre_malote_id" uuid,
  "computar" boolean DEFAULT true NOT NULL,
  "status" text DEFAULT 'aprovado' NOT NULL,
  "criado_por" text,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "transferencias_status_check" CHECK ("transferencias"."status" in ('aprovado', 'aguardando_aprovacao', 'cancelado')),
  CONSTRAINT "transferencias_valor_original_check" CHECK ("transferencias"."valor_original" >= 0),
  CONSTRAINT "transferencias_valor_acrescimo_check" CHECK ("transferencias"."valor_acrescimo" >= 0),
  CONSTRAINT "transferencias_valor_desconto_check" CHECK ("transferencias"."valor_desconto" >= 0),
  CONSTRAINT "transferencias_contas_diferentes_check" CHECK ("transferencias"."conta_origem_id" <> "transferencias"."conta_destino_id")
);

ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_empresa_id_empresas_id_fk"
  FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_caixa_id_fechamentos_caixa_id_fk"
  FOREIGN KEY ("caixa_id") REFERENCES "public"."fechamentos_caixa"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_conta_origem_id_contas_id_fk"
  FOREIGN KEY ("conta_origem_id") REFERENCES "public"."contas"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_conta_destino_id_contas_id_fk"
  FOREIGN KEY ("conta_destino_id") REFERENCES "public"."contas"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_malote_id_malotes_id_fk"
  FOREIGN KEY ("malote_id") REFERENCES "public"."malotes"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_lacre_malote_id_lacres_malotes_id_fk"
  FOREIGN KEY ("lacre_malote_id") REFERENCES "public"."lacres_malotes"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "ajustes_fechamento_caixa" ADD COLUMN "despesa_id" uuid;
ALTER TABLE "ajustes_fechamento_caixa" ADD CONSTRAINT "ajustes_fechamento_caixa_despesa_id_despesas_id_fk"
  FOREIGN KEY ("despesa_id") REFERENCES "public"."despesas"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "debitos_colaboradores" ADD COLUMN "despesa_id" uuid;
ALTER TABLE "debitos_colaboradores" ADD COLUMN "retirada_id" uuid;
ALTER TABLE "debitos_colaboradores" DROP CONSTRAINT "debitos_colaboradores_tipo_check";
ALTER TABLE "debitos_colaboradores" ADD CONSTRAINT "debitos_colaboradores_tipo_check"
  CHECK ("debitos_colaboradores"."tipo" in ('FECHAMENTO_CAIXA', 'DESPESA', 'RETIRADA'));
ALTER TABLE "debitos_colaboradores" ADD CONSTRAINT "debitos_colaboradores_despesa_id_despesas_id_fk"
  FOREIGN KEY ("despesa_id") REFERENCES "public"."despesas"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "debitos_colaboradores" ADD CONSTRAINT "debitos_colaboradores_retirada_id_retiradas_id_fk"
  FOREIGN KEY ("retirada_id") REFERENCES "public"."retiradas"("id") ON DELETE no action ON UPDATE no action;

INSERT INTO "vendas" (
  "id", "empresa_id", "caixa_id", "data_referencia", "descricao", "observacao", "valor_original",
  "valor_acrescimo", "descricao_acrescimo", "valor_desconto", "descricao_desconto", "data_pagamento",
  "conta_origem_id", "computar", "status", "criado_por", "criado_em", "atualizado_em"
)
SELECT
  "id", "empresa_id", "caixa_id", "data_referencia", "descricao", "observacao", "valor_original",
  "valor_acrescimo", "descricao_acrescimo", "valor_desconto", "descricao_desconto", "data_pagamento",
  "conta_origem_id", "computar", "status", "criado_por", "criado_em", "atualizado_em"
FROM "movimentacoes_financeiras"
WHERE "tipo" = 'entrada';

INSERT INTO "despesas" (
  "id", "empresa_id", "caixa_id", "grupo_despesa_id", "fornecedor_id", "colaborador_id",
  "data_referencia", "data_vencimento", "data_pagamento", "descricao", "observacao", "valor_original",
  "valor_acrescimo", "descricao_acrescimo", "valor_desconto", "descricao_desconto", "conta_origem_id",
  "computar", "foto_documento_url", "status", "criado_por", "criado_em", "atualizado_em"
)
SELECT
  "id", "empresa_id", "caixa_id", "grupo_despesa_id", "fornecedor_id", "colaborador_id",
  "data_referencia", coalesce("data_vencimento", "data_referencia"), "data_pagamento", "descricao", "observacao",
  "valor_original", "valor_acrescimo", "descricao_acrescimo", "valor_desconto", "descricao_desconto",
  "conta_origem_id", "computar", "foto_documento_url", "status", "criado_por", "criado_em", "atualizado_em"
FROM "movimentacoes_financeiras"
WHERE "tipo" = 'despesa';

INSERT INTO "mercadorias" (
  "id", "empresa_id", "caixa_id", "grupo_mercadoria_id", "fornecedor_id", "data_referencia", "data_vencimento",
  "data_pagamento", "descricao", "observacao", "valor_original", "valor_acrescimo", "descricao_acrescimo",
  "valor_desconto", "descricao_desconto", "conta_origem_id", "nota_fiscal_id", "tem_nota_fiscal", "computar",
  "foto_documento_url", "status", "criado_por", "criado_em", "atualizado_em"
)
SELECT
  "id", "empresa_id", "caixa_id", "grupo_mercadoria_id", "fornecedor_id", "data_referencia",
  coalesce("data_vencimento", "data_referencia"), "data_pagamento", "descricao", "observacao", "valor_original",
  "valor_acrescimo", "descricao_acrescimo", "valor_desconto", "descricao_desconto", "conta_origem_id",
  "nota_fiscal_id", "tem_nota_fiscal", "computar", "foto_documento_url", "status", "criado_por", "criado_em",
  "atualizado_em"
FROM "movimentacoes_financeiras"
WHERE "tipo" = 'mercadoria';

INSERT INTO "retiradas" (
  "id", "empresa_id", "caixa_id", "grupo_retirada_id", "colaborador_id", "data_referencia", "data_vencimento",
  "data_pagamento", "descricao", "observacao", "valor_original", "valor_acrescimo", "descricao_acrescimo",
  "valor_desconto", "descricao_desconto", "conta_origem_id", "computar", "status", "criado_por", "criado_em",
  "atualizado_em"
)
SELECT
  "id", "empresa_id", "caixa_id", "grupo_retirada_id", "colaborador_id", "data_referencia",
  coalesce("data_vencimento", "data_referencia"), "data_pagamento", "descricao", "observacao", "valor_original",
  "valor_acrescimo", "descricao_acrescimo", "valor_desconto", "descricao_desconto", "conta_origem_id", "computar",
  "status", "criado_por", "criado_em", "atualizado_em"
FROM "movimentacoes_financeiras"
WHERE "tipo" = 'retirada' AND "colaborador_id" IS NOT NULL;

INSERT INTO "transferencias" (
  "id", "empresa_id", "caixa_id", "data_referencia", "descricao", "observacao", "valor_original",
  "valor_acrescimo", "descricao_acrescimo", "valor_desconto", "descricao_desconto", "conta_origem_id",
  "conta_destino_id", "malote_id", "lacre_malote_id", "computar", "status", "criado_por", "criado_em", "atualizado_em"
)
SELECT
  "id", "empresa_id", "caixa_id", "data_referencia", "descricao", "observacao", "valor_original",
  "valor_acrescimo", "descricao_acrescimo", "valor_desconto", "descricao_desconto", "conta_origem_id",
  "conta_destino_id", "malote_id", "lacre_malote_id", "computar", "status", "criado_por", "criado_em", "atualizado_em"
FROM "movimentacoes_financeiras"
WHERE "tipo" = 'transferencia' AND "conta_origem_id" IS NOT NULL AND "conta_destino_id" IS NOT NULL;

INSERT INTO "despesas_itens" ("id", "despesa_id", "grupo_despesa_id", "descricao", "valor")
SELECT "id", "movimentacao_id", "grupo_despesa_id", "descricao", "valor"
FROM "itens_despesas"
WHERE EXISTS (SELECT 1 FROM "despesas" WHERE "despesas"."id" = "itens_despesas"."movimentacao_id");

INSERT INTO "mercadorias_itens" (
  "id", "mercadoria_id", "produto_id", "grupo_mercadoria_id", "unidade_medida_id", "descricao",
  "quantidade", "valor_unitario", "valor_total"
)
SELECT
  "id", "movimentacao_id", "produto_id", "grupo_mercadoria_id", "unidade_medida_id", "descricao",
  "quantidade", "valor_unitario", "valor_total"
FROM "itens_mercadorias"
WHERE EXISTS (SELECT 1 FROM "mercadorias" WHERE "mercadorias"."id" = "itens_mercadorias"."movimentacao_id");

INSERT INTO "vendas" ("id", "empresa_id", "data_referencia", "data_venda", "descricao", "valor_original", "criado_em", "atualizado_em")
SELECT
  "id", "empresa_id", "data_venda", "data_venda"::timestamp with time zone, 'Venda diaria', "valor_total", "criado_em", "criado_em"
FROM "itens_vendas"
WHERE NOT EXISTS (SELECT 1 FROM "vendas" WHERE "vendas"."id" = "itens_vendas"."id");

INSERT INTO "vendas_itens" (
  "venda_id", "produto_id", "descricao_produto", "quantidade", "valor_unitario", "valor_total", "criado_em"
)
SELECT
  "id", "produto_id", "descricao_produto", "quantidade",
  CASE WHEN "quantidade"::numeric > 0 THEN ("valor_total"::numeric / "quantidade"::numeric)::numeric(14, 4) ELSE 0 END,
  "valor_total", "criado_em"
FROM "itens_vendas";

UPDATE "ajustes_fechamento_caixa"
SET "despesa_id" = "movimentacao_id"
WHERE "movimentacao_id" IN (SELECT "id" FROM "despesas");

UPDATE "debitos_colaboradores"
SET "despesa_id" = "movimentacao_id"
WHERE "movimentacao_id" IN (SELECT "id" FROM "despesas");
