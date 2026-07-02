CREATE TABLE "ajustes_fechamento_caixa" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"fechamento_caixa_id" uuid NOT NULL,
	"despesa_id" uuid,
	"valor_diferenca" numeric(14, 2) NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "areas" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"importado_de" uuid,
	"id_importado" uuid
);
--> statement-breakpoint
CREATE TABLE "cargos" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"importado_de" uuid,
	"id_importado" uuid,
	CONSTRAINT "cargos_empresa_nome_unica" UNIQUE("empresa_id","nome")
);
--> statement-breakpoint
CREATE TABLE "clientes" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"documento" text,
	"data_nascimento" text,
	"whatsapp" text,
	"email" text,
	"cep" text,
	"rua" text,
	"numero" text,
	"complemento" text,
	"bairro" text,
	"cidade" text,
	"estado" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"importado_de" uuid,
	"id_importado" uuid
);
--> statement-breakpoint
CREATE TABLE "colaboradores" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"cpf" text,
	"setor_id" uuid,
	"usuario_id" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"importado_de" uuid,
	"id_importado" uuid
);
--> statement-breakpoint
CREATE TABLE "colaboradores_cargos" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"colaborador_id" uuid NOT NULL,
	"setor_id" uuid,
	"cargo_id" uuid NOT NULL,
	"remuneracao_minuto" numeric(14, 6) NOT NULL,
	"data_inicio" date NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"importado_de" uuid,
	"id_importado" uuid,
	CONSTRAINT "colaboradores_cargos_empresa_colaborador_cargo_data_unica" UNIQUE("empresa_id","colaborador_id","cargo_id","data_inicio"),
	CONSTRAINT "colaboradores_cargos_remuneracao_minuto_check" CHECK ("colaboradores_cargos"."remuneracao_minuto" > 0)
);
--> statement-breakpoint
CREATE TABLE "colaboradores_faltas_justificadas" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"colaborador_id" uuid NOT NULL,
	"inicio" timestamp with time zone NOT NULL,
	"fim" timestamp with time zone NOT NULL,
	"motivo" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"importado_de" uuid,
	"id_importado" uuid,
	CONSTRAINT "colaboradores_faltas_justificadas_fim_check" CHECK ("colaboradores_faltas_justificadas"."fim" > "colaboradores_faltas_justificadas"."inicio")
);
--> statement-breakpoint
CREATE TABLE "colaboradores_jornadas" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"colaborador_id" uuid NOT NULL,
	"dia_da_semana" text NOT NULL,
	"carga_horaria_diaria_em_minutos" integer NOT NULL,
	"intervalo_minutos" integer DEFAULT 0 NOT NULL,
	"colaborador_cargo_id" uuid,
	"hora_entrada" time,
	"data_inicio" date NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"importado_de" uuid,
	"id_importado" uuid,
	CONSTRAINT "colaboradores_jornadas_dia_da_semana_check" CHECK ("colaboradores_jornadas"."dia_da_semana" in ('SEGUNDA', 'TERCA', 'QUARTA', 'QUINTA', 'SEXTA', 'SABADO', 'DOMINGO')),
	CONSTRAINT "colaboradores_jornadas_carga_check" CHECK ("colaboradores_jornadas"."carga_horaria_diaria_em_minutos" >= 0),
	CONSTRAINT "colaboradores_jornadas_intervalo_check" CHECK ("colaboradores_jornadas"."intervalo_minutos" >= 0)
);
--> statement-breakpoint
CREATE TABLE "contas" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"importado_de" uuid,
	"id_importado" uuid
);
--> statement-breakpoint
CREATE TABLE "debitos_colaboradores" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"colaborador_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"despesa_id" uuid,
	"retirada_id" uuid,
	"caixa_id" uuid,
	"valor" numeric(14, 2) NOT NULL,
	"observacao" text,
	"criado_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "debitos_colaboradores_tipo_check" CHECK ("debitos_colaboradores"."tipo" in ('FECHAMENTO_CAIXA', 'DESPESA', 'RETIRADA')),
	CONSTRAINT "debitos_colaboradores_valor_check" CHECK ("debitos_colaboradores"."valor" >= 0)
);
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE "despesas_itens" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"despesa_id" uuid NOT NULL,
	"grupo_despesa_id" uuid,
	"colaborador_id" uuid,
	"descricao" text NOT NULL,
	"valor" numeric(14, 2) NOT NULL,
	CONSTRAINT "despesas_itens_valor_check" CHECK ("despesas_itens"."valor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "edicoes_caixa" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"caixa_id" uuid NOT NULL,
	"token_usado" text NOT NULL,
	"editado_por" text,
	"editado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"valores_antigos" jsonb NOT NULL,
	"valores_novos" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "empresas" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"nome" text NOT NULL,
	"cnpj" text,
	"configuracoes_aparencia" jsonb DEFAULT '{"padrao":{"corPrimaria":"#6d28d9","corSecundaria":"#0891b2","corFundo":"#eaf1f9","corCartao":"#ffffff","corSucesso":"#16a34a","corAviso":"#f59e0b","corErro":"#ef4444"},"especifico":[]}'::jsonb NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fechamentos_caixa" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"pdv_id" uuid,
	"usuario_id" text,
	"usuario_caixa_id" text,
	"colaborador_id" uuid NOT NULL,
	"data_movimento" date NOT NULL,
	"data_hora_abertura" timestamp with time zone,
	"aberto_em" timestamp with time zone,
	"data_hora_fechamento" timestamp with time zone,
	"fechado_em" timestamp with time zone,
	"token_edicao" text,
	"observacao" text,
	"total_entradas" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total_transferencias" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total_transferencias_entrada" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total_transferencias_saida" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total_despesas" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total_retiradas" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total_mercadorias" numeric(14, 2) DEFAULT '0' NOT NULL,
	"saldo" numeric(14, 2) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'aberto' NOT NULL,
	"criado_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fechamentos_caixa_status_check" CHECK ("fechamentos_caixa"."status" in ('aberto', 'fechado', 'ajustado'))
);
--> statement-breakpoint
CREATE TABLE "formas_pagamento" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"importado_de" uuid,
	"id_importado" uuid,
	CONSTRAINT "formas_pagamento_empresa_nome_unica" UNIQUE("empresa_id","nome")
);
--> statement-breakpoint
CREATE TABLE "fornecedores" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"documento" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"importado_de" uuid,
	"id_importado" uuid
);
--> statement-breakpoint
CREATE TABLE "grupos_despesas" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"grupo_pai_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"importado_de" uuid,
	"id_importado" uuid
);
--> statement-breakpoint
CREATE TABLE "grupos_mercadorias" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"grupo_pai_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"importado_de" uuid,
	"id_importado" uuid
);
--> statement-breakpoint
CREATE TABLE "grupos_retiradas" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"grupo_pai_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"importado_de" uuid,
	"id_importado" uuid
);
--> statement-breakpoint
CREATE TABLE "grupos_vendas" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"grupo_pai_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"importado_de" uuid,
	"id_importado" uuid
);
--> statement-breakpoint
CREATE TABLE "integracoes_campos_config" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"campo" text NOT NULL,
	"criar_automaticamente" boolean DEFAULT true NOT NULL,
	"vincular_automaticamente" boolean DEFAULT true NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integracoes_campos_config_empresa_tipo_campo_unico" UNIQUE("empresa_id","tipo","campo"),
	CONSTRAINT "integracoes_campos_config_tipo_check" CHECK ("integracoes_campos_config"."tipo" in ('vendas')),
	CONSTRAINT "integracoes_campos_config_campo_check" CHECK ("integracoes_campos_config"."campo" in ('pdv', 'cliente', 'produto', 'forma_pagamento'))
);
--> statement-breakpoint
CREATE TABLE "integracoes_chaves" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"codigo" text NOT NULL,
	"codigo_hash" text,
	"ativa" boolean DEFAULT true NOT NULL,
	"criado_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"inativado_em" timestamp with time zone,
	CONSTRAINT "integracoes_chaves_codigo_unico" UNIQUE("codigo"),
	CONSTRAINT "integracoes_chaves_tipo_check" CHECK ("integracoes_chaves"."tipo" in ('vendas'))
);
--> statement-breakpoint
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
	CONSTRAINT "integracoes_historico_tipo_check" CHECK ("integracoes_historico"."tipo" in ('vendas')),
	CONSTRAINT "integracoes_historico_status_check" CHECK ("integracoes_historico"."status" in ('criado', 'atualizado', 'sem_novidade', 'erro'))
);
--> statement-breakpoint
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
	CONSTRAINT "integracoes_registros_externo_unico" UNIQUE("empresa_id","integracao_chave_id","tipo_registro","identificador_externo"),
	CONSTRAINT "integracoes_registros_tipo_registro_check" CHECK ("integracoes_registros"."tipo_registro" in ('venda', 'pdv', 'cliente', 'produto', 'forma_pagamento'))
);
--> statement-breakpoint
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
--> statement-breakpoint
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
	CONSTRAINT "integracoes_vinculos_externo_unico" UNIQUE("empresa_id","tipo","tipo_registro","identificador_externo"),
	CONSTRAINT "integracoes_vinculos_tipo_check" CHECK ("integracoes_vinculos"."tipo" in ('vendas')),
	CONSTRAINT "integracoes_vinculos_tipo_registro_check" CHECK ("integracoes_vinculos"."tipo_registro" in ('venda', 'pdv', 'cliente', 'produto', 'forma_pagamento'))
);
--> statement-breakpoint
CREATE TABLE "itens_vendas" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"produto_id" uuid,
	"descricao_produto" text NOT NULL,
	"quantidade" numeric(14, 3) DEFAULT '0' NOT NULL,
	"valor_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"data_venda" date NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lacres_malotes" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"malote_id" uuid NOT NULL,
	"numero" text NOT NULL,
	"status" text DEFAULT 'disponivel' NOT NULL,
	"usado_em" timestamp with time zone,
	CONSTRAINT "lacres_malotes_malote_id_numero_key" UNIQUE("malote_id","numero"),
	CONSTRAINT "lacres_malotes_status_check" CHECK ("lacres_malotes"."status" in ('disponivel', 'usado', 'cancelado'))
);
--> statement-breakpoint
CREATE TABLE "malotes" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"descricao" text,
	"criado_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"importado_de" uuid,
	"id_importado" uuid,
	CONSTRAINT "malotes_empresa_id_codigo_key" UNIQUE("empresa_id","codigo")
);
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE "pdvs" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"codigo" text,
	"conta_id" uuid NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pdvs_empresa_nome_unica" UNIQUE("empresa_id","nome")
);
--> statement-breakpoint
CREATE TABLE "perfis_usuarios" (
	"usuario_id" text PRIMARY KEY NOT NULL,
	"empresa_id" uuid,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'usuario_comum' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "perfis_usuarios_email_unique" UNIQUE("email"),
	CONSTRAINT "perfis_usuarios_role_check" CHECK ("perfis_usuarios"."role" in ('usuario_comum', 'usuario_admin', 'admin'))
);
--> statement-breakpoint
CREATE TABLE "permissoes_cargos" (
	"cargo_id" uuid NOT NULL,
	"regras" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "permissoes_cargos_cargo_id_pk" PRIMARY KEY("cargo_id")
);
--> statement-breakpoint
CREATE TABLE "permissoes_setores" (
	"setor_id" uuid NOT NULL,
	"regras" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "permissoes_setores_setor_id_pk" PRIMARY KEY("setor_id")
);
--> statement-breakpoint
CREATE TABLE "permissoes" (
	"codigo" text PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"descricao" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permissoes_usuarios" (
	"usuario_id" text NOT NULL,
	"regras" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "permissoes_usuarios_usuario_id_pk" PRIMARY KEY("usuario_id")
);
--> statement-breakpoint
CREATE TABLE "produtos" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"grupo_mercadoria_id" uuid,
	"unidade_medida_id" uuid,
	"unidade_individual_id" uuid,
	"codigo" text,
	"codigo_interno" text,
	"codigo_barras" text,
	"descricao" text NOT NULL,
	"marca" text,
	"quantidade_individual" numeric(14, 3) DEFAULT '1' NOT NULL,
	"embalagem" text,
	"c_de" text,
	"quantidade_caixa" integer DEFAULT 1 NOT NULL,
	"medida_compra" text,
	"custo" numeric(14, 2),
	"margem" numeric(6, 4),
	"preco_venda" numeric(14, 2),
	"auto" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'ativo' NOT NULL,
	"tipo" text DEFAULT 'revenda' NOT NULL,
	"quantidade_estoque" numeric(14, 3) DEFAULT '0' NOT NULL,
	"estoque_min" numeric(14, 3),
	"estoque_max" numeric(14, 3),
	"setor_estoque" text,
	"local_venda_1" text,
	"local_venda_2" text,
	"foto_url" text,
	"criado_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"importado_de" uuid,
	"id_importado" uuid
);
--> statement-breakpoint
CREATE TABLE "produtos_conversoes" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"produto_id" uuid NOT NULL,
	"unidade_medida_id" uuid NOT NULL,
	"quantidade" numeric(14, 3) NOT NULL,
	"unidades_individuais" numeric(14, 3) NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "produtos_conversoes_quantidade_check" CHECK ("produtos_conversoes"."quantidade" > 0),
	CONSTRAINT "produtos_conversoes_unidades_individuais_check" CHECK ("produtos_conversoes"."unidades_individuais" > 0)
);
--> statement-breakpoint
CREATE TABLE "produtos_fiscal" (
	"produto_id" uuid PRIMARY KEY NOT NULL,
	"ncm" text,
	"cest" text,
	"categoria_fiscal" text,
	"cst_pis_cofins" text,
	"aliquota_cheia" numeric(6, 4),
	"aliquota_fcp" numeric(6, 4),
	"aliquota_pis" numeric(6, 4),
	"aliquota_cofins" numeric(6, 4),
	"reducao_icms" numeric(6, 4),
	"icms" numeric(6, 4),
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "produtos_promocoes" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"produto_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"valor" numeric(14, 2),
	"desconto_fracao" numeric(6, 4),
	"hora_inicio" time,
	"hora_fim" time,
	"seg" boolean DEFAULT false NOT NULL,
	"ter" boolean DEFAULT false NOT NULL,
	"qua" boolean DEFAULT false NOT NULL,
	"qui" boolean DEFAULT false NOT NULL,
	"sex" boolean DEFAULT false NOT NULL,
	"sab" boolean DEFAULT false NOT NULL,
	"dom" boolean DEFAULT false NOT NULL,
	"valida_ate" date,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "produtos_promocoes_tipo_check" CHECK ("produtos_promocoes"."tipo" in ('valor', 'desconto'))
);
--> statement-breakpoint
CREATE TABLE "produtos_transformacao" (
	"produto_id" uuid PRIMARY KEY NOT NULL,
	"precisao" text,
	"quantidade" numeric(14, 3),
	"unidade" text,
	"produto_receituario" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "produtos_transformacao_precisao_check" CHECK ("produtos_transformacao"."precisao" is null or "produtos_transformacao"."precisao" in ('EXATOS', 'APROXIMADOS')),
	CONSTRAINT "produtos_transformacao_unidade_check" CHECK ("produtos_transformacao"."unidade" is null or "produtos_transformacao"."unidade" in ('UN', 'G', 'ML'))
);
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE "setores" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"area_id" uuid,
	"setor_pai_id" uuid,
	"nome" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"importado_de" uuid,
	"id_importado" uuid
);
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE "unidades_medida" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"sigla" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"importado_de" uuid,
	"id_importado" uuid
);
--> statement-breakpoint
CREATE TABLE "usuarios_empresas" (
	"usuario_id" text NOT NULL,
	"empresa_id" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_empresas_usuario_id_empresa_id_pk" PRIMARY KEY("usuario_id","empresa_id")
);
--> statement-breakpoint
CREATE TABLE "vendas" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"integracao_chave_id" uuid,
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
	"cliente_id" uuid,
	"identificador_externo" text,
	"hash_integracao" text,
	"status_externo" text,
	"numero_nota_fiscal" text,
	"pdv_automacao_id" text,
	"pdv_automacao" text,
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
--> statement-breakpoint
CREATE TABLE "vendas_comprovantes" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"venda_id" uuid NOT NULL,
	"nome_original" text NOT NULL,
	"nome_arquivo" text NOT NULL,
	"caminho" text NOT NULL,
	"mime_type" text NOT NULL,
	"tamanho_bytes" integer NOT NULL,
	"criado_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"userId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamp with time zone,
	"refreshTokenExpiresAt" timestamp with time zone,
	"scope" text,
	"password" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"image" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ajustes_fechamento_caixa" ADD CONSTRAINT "ajustes_fechamento_caixa_fechamento_caixa_id_fechamentos_caixa_id_fk" FOREIGN KEY ("fechamento_caixa_id") REFERENCES "public"."fechamentos_caixa"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ajustes_fechamento_caixa" ADD CONSTRAINT "ajustes_fechamento_caixa_despesa_id_despesas_id_fk" FOREIGN KEY ("despesa_id") REFERENCES "public"."despesas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "areas" ADD CONSTRAINT "areas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "areas" ADD CONSTRAINT "areas_importado_de_empresas_id_fk" FOREIGN KEY ("importado_de") REFERENCES "public"."empresas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cargos" ADD CONSTRAINT "cargos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cargos" ADD CONSTRAINT "cargos_importado_de_empresas_id_fk" FOREIGN KEY ("importado_de") REFERENCES "public"."empresas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_importado_de_empresas_id_fk" FOREIGN KEY ("importado_de") REFERENCES "public"."empresas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colaboradores" ADD CONSTRAINT "colaboradores_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colaboradores" ADD CONSTRAINT "colaboradores_setor_id_setores_id_fk" FOREIGN KEY ("setor_id") REFERENCES "public"."setores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colaboradores" ADD CONSTRAINT "colaboradores_usuario_id_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colaboradores" ADD CONSTRAINT "colaboradores_importado_de_empresas_id_fk" FOREIGN KEY ("importado_de") REFERENCES "public"."empresas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colaboradores_cargos" ADD CONSTRAINT "colaboradores_cargos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colaboradores_cargos" ADD CONSTRAINT "colaboradores_cargos_colaborador_id_colaboradores_id_fk" FOREIGN KEY ("colaborador_id") REFERENCES "public"."colaboradores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colaboradores_cargos" ADD CONSTRAINT "colaboradores_cargos_setor_id_setores_id_fk" FOREIGN KEY ("setor_id") REFERENCES "public"."setores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colaboradores_cargos" ADD CONSTRAINT "colaboradores_cargos_cargo_id_cargos_id_fk" FOREIGN KEY ("cargo_id") REFERENCES "public"."cargos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colaboradores_cargos" ADD CONSTRAINT "colaboradores_cargos_importado_de_empresas_id_fk" FOREIGN KEY ("importado_de") REFERENCES "public"."empresas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colaboradores_faltas_justificadas" ADD CONSTRAINT "colaboradores_faltas_justificadas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colaboradores_faltas_justificadas" ADD CONSTRAINT "colaboradores_faltas_justificadas_colaborador_id_colaboradores_id_fk" FOREIGN KEY ("colaborador_id") REFERENCES "public"."colaboradores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colaboradores_faltas_justificadas" ADD CONSTRAINT "colaboradores_faltas_justificadas_importado_de_empresas_id_fk" FOREIGN KEY ("importado_de") REFERENCES "public"."empresas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colaboradores_jornadas" ADD CONSTRAINT "colaboradores_jornadas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colaboradores_jornadas" ADD CONSTRAINT "colaboradores_jornadas_colaborador_id_colaboradores_id_fk" FOREIGN KEY ("colaborador_id") REFERENCES "public"."colaboradores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colaboradores_jornadas" ADD CONSTRAINT "colaboradores_jornadas_colaborador_cargo_id_colaboradores_cargos_id_fk" FOREIGN KEY ("colaborador_cargo_id") REFERENCES "public"."colaboradores_cargos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colaboradores_jornadas" ADD CONSTRAINT "colaboradores_jornadas_importado_de_empresas_id_fk" FOREIGN KEY ("importado_de") REFERENCES "public"."empresas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contas" ADD CONSTRAINT "contas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contas" ADD CONSTRAINT "contas_importado_de_empresas_id_fk" FOREIGN KEY ("importado_de") REFERENCES "public"."empresas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debitos_colaboradores" ADD CONSTRAINT "debitos_colaboradores_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debitos_colaboradores" ADD CONSTRAINT "debitos_colaboradores_colaborador_id_colaboradores_id_fk" FOREIGN KEY ("colaborador_id") REFERENCES "public"."colaboradores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debitos_colaboradores" ADD CONSTRAINT "debitos_colaboradores_despesa_id_despesas_id_fk" FOREIGN KEY ("despesa_id") REFERENCES "public"."despesas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debitos_colaboradores" ADD CONSTRAINT "debitos_colaboradores_retirada_id_retiradas_id_fk" FOREIGN KEY ("retirada_id") REFERENCES "public"."retiradas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debitos_colaboradores" ADD CONSTRAINT "debitos_colaboradores_caixa_id_fechamentos_caixa_id_fk" FOREIGN KEY ("caixa_id") REFERENCES "public"."fechamentos_caixa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debitos_colaboradores" ADD CONSTRAINT "debitos_colaboradores_criado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "despesas" ADD CONSTRAINT "despesas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "despesas" ADD CONSTRAINT "despesas_caixa_id_fechamentos_caixa_id_fk" FOREIGN KEY ("caixa_id") REFERENCES "public"."fechamentos_caixa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "despesas" ADD CONSTRAINT "despesas_grupo_despesa_id_grupos_despesas_id_fk" FOREIGN KEY ("grupo_despesa_id") REFERENCES "public"."grupos_despesas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "despesas" ADD CONSTRAINT "despesas_fornecedor_id_fornecedores_id_fk" FOREIGN KEY ("fornecedor_id") REFERENCES "public"."fornecedores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "despesas" ADD CONSTRAINT "despesas_colaborador_id_colaboradores_id_fk" FOREIGN KEY ("colaborador_id") REFERENCES "public"."colaboradores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "despesas" ADD CONSTRAINT "despesas_conta_origem_id_contas_id_fk" FOREIGN KEY ("conta_origem_id") REFERENCES "public"."contas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "despesas_itens" ADD CONSTRAINT "despesas_itens_despesa_id_despesas_id_fk" FOREIGN KEY ("despesa_id") REFERENCES "public"."despesas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "despesas_itens" ADD CONSTRAINT "despesas_itens_grupo_despesa_id_grupos_despesas_id_fk" FOREIGN KEY ("grupo_despesa_id") REFERENCES "public"."grupos_despesas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "despesas_itens" ADD CONSTRAINT "despesas_itens_colaborador_id_colaboradores_id_fk" FOREIGN KEY ("colaborador_id") REFERENCES "public"."colaboradores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edicoes_caixa" ADD CONSTRAINT "edicoes_caixa_caixa_id_fechamentos_caixa_id_fk" FOREIGN KEY ("caixa_id") REFERENCES "public"."fechamentos_caixa"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edicoes_caixa" ADD CONSTRAINT "edicoes_caixa_editado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("editado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fechamentos_caixa" ADD CONSTRAINT "fechamentos_caixa_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fechamentos_caixa" ADD CONSTRAINT "fechamentos_caixa_pdv_id_pdvs_id_fk" FOREIGN KEY ("pdv_id") REFERENCES "public"."pdvs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fechamentos_caixa" ADD CONSTRAINT "fechamentos_caixa_usuario_id_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fechamentos_caixa" ADD CONSTRAINT "fechamentos_caixa_usuario_caixa_id_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("usuario_caixa_id") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fechamentos_caixa" ADD CONSTRAINT "fechamentos_caixa_colaborador_id_colaboradores_id_fk" FOREIGN KEY ("colaborador_id") REFERENCES "public"."colaboradores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formas_pagamento" ADD CONSTRAINT "formas_pagamento_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formas_pagamento" ADD CONSTRAINT "formas_pagamento_importado_de_empresas_id_fk" FOREIGN KEY ("importado_de") REFERENCES "public"."empresas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fornecedores" ADD CONSTRAINT "fornecedores_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fornecedores" ADD CONSTRAINT "fornecedores_importado_de_empresas_id_fk" FOREIGN KEY ("importado_de") REFERENCES "public"."empresas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grupos_despesas" ADD CONSTRAINT "grupos_despesas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grupos_despesas" ADD CONSTRAINT "grupos_despesas_grupo_pai_id_grupos_despesas_id_fk" FOREIGN KEY ("grupo_pai_id") REFERENCES "public"."grupos_despesas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grupos_despesas" ADD CONSTRAINT "grupos_despesas_importado_de_empresas_id_fk" FOREIGN KEY ("importado_de") REFERENCES "public"."empresas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grupos_mercadorias" ADD CONSTRAINT "grupos_mercadorias_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grupos_mercadorias" ADD CONSTRAINT "grupos_mercadorias_grupo_pai_id_grupos_mercadorias_id_fk" FOREIGN KEY ("grupo_pai_id") REFERENCES "public"."grupos_mercadorias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grupos_mercadorias" ADD CONSTRAINT "grupos_mercadorias_importado_de_empresas_id_fk" FOREIGN KEY ("importado_de") REFERENCES "public"."empresas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grupos_retiradas" ADD CONSTRAINT "grupos_retiradas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grupos_retiradas" ADD CONSTRAINT "grupos_retiradas_grupo_pai_id_grupos_retiradas_id_fk" FOREIGN KEY ("grupo_pai_id") REFERENCES "public"."grupos_retiradas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grupos_retiradas" ADD CONSTRAINT "grupos_retiradas_importado_de_empresas_id_fk" FOREIGN KEY ("importado_de") REFERENCES "public"."empresas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grupos_vendas" ADD CONSTRAINT "grupos_vendas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grupos_vendas" ADD CONSTRAINT "grupos_vendas_grupo_pai_id_grupos_vendas_id_fk" FOREIGN KEY ("grupo_pai_id") REFERENCES "public"."grupos_vendas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grupos_vendas" ADD CONSTRAINT "grupos_vendas_importado_de_empresas_id_fk" FOREIGN KEY ("importado_de") REFERENCES "public"."empresas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integracoes_campos_config" ADD CONSTRAINT "integracoes_campos_config_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integracoes_chaves" ADD CONSTRAINT "integracoes_chaves_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integracoes_historico" ADD CONSTRAINT "integracoes_historico_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integracoes_historico" ADD CONSTRAINT "integracoes_historico_integracao_chave_id_integracoes_chaves_id_fk" FOREIGN KEY ("integracao_chave_id") REFERENCES "public"."integracoes_chaves"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integracoes_registros" ADD CONSTRAINT "integracoes_registros_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integracoes_registros" ADD CONSTRAINT "integracoes_registros_integracao_chave_id_integracoes_chaves_id_fk" FOREIGN KEY ("integracao_chave_id") REFERENCES "public"."integracoes_chaves"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integracoes_sem_novidade" ADD CONSTRAINT "integracoes_sem_novidade_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integracoes_sem_novidade" ADD CONSTRAINT "integracoes_sem_novidade_integracao_chave_id_integracoes_chaves_id_fk" FOREIGN KEY ("integracao_chave_id") REFERENCES "public"."integracoes_chaves"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integracoes_vinculos" ADD CONSTRAINT "integracoes_vinculos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itens_vendas" ADD CONSTRAINT "itens_vendas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itens_vendas" ADD CONSTRAINT "itens_vendas_produto_id_produtos_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."produtos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lacres_malotes" ADD CONSTRAINT "lacres_malotes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lacres_malotes" ADD CONSTRAINT "lacres_malotes_malote_id_malotes_id_fk" FOREIGN KEY ("malote_id") REFERENCES "public"."malotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "malotes" ADD CONSTRAINT "malotes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "malotes" ADD CONSTRAINT "malotes_importado_de_empresas_id_fk" FOREIGN KEY ("importado_de") REFERENCES "public"."empresas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mercadorias" ADD CONSTRAINT "mercadorias_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mercadorias" ADD CONSTRAINT "mercadorias_caixa_id_fechamentos_caixa_id_fk" FOREIGN KEY ("caixa_id") REFERENCES "public"."fechamentos_caixa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mercadorias" ADD CONSTRAINT "mercadorias_grupo_mercadoria_id_grupos_mercadorias_id_fk" FOREIGN KEY ("grupo_mercadoria_id") REFERENCES "public"."grupos_mercadorias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mercadorias" ADD CONSTRAINT "mercadorias_fornecedor_id_fornecedores_id_fk" FOREIGN KEY ("fornecedor_id") REFERENCES "public"."fornecedores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mercadorias" ADD CONSTRAINT "mercadorias_conta_origem_id_contas_id_fk" FOREIGN KEY ("conta_origem_id") REFERENCES "public"."contas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mercadorias_itens" ADD CONSTRAINT "mercadorias_itens_mercadoria_id_mercadorias_id_fk" FOREIGN KEY ("mercadoria_id") REFERENCES "public"."mercadorias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mercadorias_itens" ADD CONSTRAINT "mercadorias_itens_produto_id_produtos_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."produtos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mercadorias_itens" ADD CONSTRAINT "mercadorias_itens_grupo_mercadoria_id_grupos_mercadorias_id_fk" FOREIGN KEY ("grupo_mercadoria_id") REFERENCES "public"."grupos_mercadorias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mercadorias_itens" ADD CONSTRAINT "mercadorias_itens_unidade_medida_id_unidades_medida_id_fk" FOREIGN KEY ("unidade_medida_id") REFERENCES "public"."unidades_medida"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pdvs" ADD CONSTRAINT "pdvs_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pdvs" ADD CONSTRAINT "pdvs_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perfis_usuarios" ADD CONSTRAINT "perfis_usuarios_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permissoes_cargos" ADD CONSTRAINT "permissoes_cargos_cargo_id_cargos_id_fk" FOREIGN KEY ("cargo_id") REFERENCES "public"."cargos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permissoes_setores" ADD CONSTRAINT "permissoes_setores_setor_id_setores_id_fk" FOREIGN KEY ("setor_id") REFERENCES "public"."setores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permissoes_usuarios" ADD CONSTRAINT "permissoes_usuarios_usuario_id_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_grupo_mercadoria_id_grupos_mercadorias_id_fk" FOREIGN KEY ("grupo_mercadoria_id") REFERENCES "public"."grupos_mercadorias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_unidade_medida_id_unidades_medida_id_fk" FOREIGN KEY ("unidade_medida_id") REFERENCES "public"."unidades_medida"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_unidade_individual_id_unidades_medida_id_fk" FOREIGN KEY ("unidade_individual_id") REFERENCES "public"."unidades_medida"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_importado_de_empresas_id_fk" FOREIGN KEY ("importado_de") REFERENCES "public"."empresas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produtos_conversoes" ADD CONSTRAINT "produtos_conversoes_produto_id_produtos_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."produtos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produtos_conversoes" ADD CONSTRAINT "produtos_conversoes_unidade_medida_id_unidades_medida_id_fk" FOREIGN KEY ("unidade_medida_id") REFERENCES "public"."unidades_medida"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produtos_fiscal" ADD CONSTRAINT "produtos_fiscal_produto_id_produtos_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."produtos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produtos_promocoes" ADD CONSTRAINT "produtos_promocoes_produto_id_produtos_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."produtos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produtos_transformacao" ADD CONSTRAINT "produtos_transformacao_produto_id_produtos_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."produtos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retiradas" ADD CONSTRAINT "retiradas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retiradas" ADD CONSTRAINT "retiradas_caixa_id_fechamentos_caixa_id_fk" FOREIGN KEY ("caixa_id") REFERENCES "public"."fechamentos_caixa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retiradas" ADD CONSTRAINT "retiradas_grupo_retirada_id_grupos_retiradas_id_fk" FOREIGN KEY ("grupo_retirada_id") REFERENCES "public"."grupos_retiradas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retiradas" ADD CONSTRAINT "retiradas_colaborador_id_colaboradores_id_fk" FOREIGN KEY ("colaborador_id") REFERENCES "public"."colaboradores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retiradas" ADD CONSTRAINT "retiradas_conta_origem_id_contas_id_fk" FOREIGN KEY ("conta_origem_id") REFERENCES "public"."contas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setores" ADD CONSTRAINT "setores_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setores" ADD CONSTRAINT "setores_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setores" ADD CONSTRAINT "setores_setor_pai_id_setores_id_fk" FOREIGN KEY ("setor_pai_id") REFERENCES "public"."setores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setores" ADD CONSTRAINT "setores_importado_de_empresas_id_fk" FOREIGN KEY ("importado_de") REFERENCES "public"."empresas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_caixa_id_fechamentos_caixa_id_fk" FOREIGN KEY ("caixa_id") REFERENCES "public"."fechamentos_caixa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_conta_origem_id_contas_id_fk" FOREIGN KEY ("conta_origem_id") REFERENCES "public"."contas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_conta_destino_id_contas_id_fk" FOREIGN KEY ("conta_destino_id") REFERENCES "public"."contas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_malote_id_malotes_id_fk" FOREIGN KEY ("malote_id") REFERENCES "public"."malotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_lacre_malote_id_lacres_malotes_id_fk" FOREIGN KEY ("lacre_malote_id") REFERENCES "public"."lacres_malotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unidades_medida" ADD CONSTRAINT "unidades_medida_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unidades_medida" ADD CONSTRAINT "unidades_medida_importado_de_empresas_id_fk" FOREIGN KEY ("importado_de") REFERENCES "public"."empresas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios_empresas" ADD CONSTRAINT "usuarios_empresas_usuario_id_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios_empresas" ADD CONSTRAINT "usuarios_empresas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_integracao_chave_id_integracoes_chaves_id_fk" FOREIGN KEY ("integracao_chave_id") REFERENCES "public"."integracoes_chaves"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_caixa_id_fechamentos_caixa_id_fk" FOREIGN KEY ("caixa_id") REFERENCES "public"."fechamentos_caixa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_conta_origem_id_contas_id_fk" FOREIGN KEY ("conta_origem_id") REFERENCES "public"."contas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_pdv_id_pdvs_id_fk" FOREIGN KEY ("pdv_id") REFERENCES "public"."pdvs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_colaborador_id_colaboradores_id_fk" FOREIGN KEY ("colaborador_id") REFERENCES "public"."colaboradores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas_comprovantes" ADD CONSTRAINT "vendas_comprovantes_venda_id_vendas_id_fk" FOREIGN KEY ("venda_id") REFERENCES "public"."vendas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas_comprovantes" ADD CONSTRAINT "vendas_comprovantes_criado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas_pagamentos" ADD CONSTRAINT "vendas_pagamentos_venda_id_vendas_id_fk" FOREIGN KEY ("venda_id") REFERENCES "public"."vendas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas_pagamentos" ADD CONSTRAINT "vendas_pagamentos_forma_pagamento_id_formas_pagamento_id_fk" FOREIGN KEY ("forma_pagamento_id") REFERENCES "public"."formas_pagamento"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas_produtos" ADD CONSTRAINT "vendas_produtos_venda_id_vendas_id_fk" FOREIGN KEY ("venda_id") REFERENCES "public"."vendas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas_produtos" ADD CONSTRAINT "vendas_produtos_produto_id_produtos_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."produtos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "clientes_empresa_documento_unico_idx" ON "clientes" USING btree ("empresa_id",lower("documento")) WHERE "clientes"."documento" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "colaboradores_usuario_id_unico" ON "colaboradores" USING btree ("usuario_id") WHERE "colaboradores"."usuario_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "integracoes_chaves_codigo_hash_unico_idx" ON "integracoes_chaves" USING btree ("codigo_hash") WHERE "integracoes_chaves"."codigo_hash" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "lacres_malotes_empresa_numero_unico_idx" ON "lacres_malotes" USING btree ("empresa_id",lower("numero"));--> statement-breakpoint
CREATE UNIQUE INDEX "pdvs_empresa_codigo_unico_idx" ON "pdvs" USING btree ("empresa_id",lower("codigo")) WHERE "pdvs"."codigo" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "produtos_codigo_interno_empresa_uidx" ON "produtos" USING btree ("empresa_id","codigo_interno");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");