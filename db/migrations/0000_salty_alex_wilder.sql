CREATE TABLE "ajustes_fechamento_caixa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fechamento_caixa_id" uuid NOT NULL,
	"movimentacao_id" uuid,
	"valor_diferenca" numeric(14, 2) NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"importado_de" uuid,
	"id_importado" uuid
);
--> statement-breakpoint
CREATE TABLE "cargos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"importado_de" uuid,
	"id_importado" uuid,
	CONSTRAINT "cargos_empresa_nome_unica" UNIQUE("empresa_id","nome")
);
--> statement-breakpoint
CREATE TABLE "colaboradores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
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
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
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
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
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
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
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
CREATE TABLE "configuracoes_tema" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"cor_primaria" text DEFAULT '#6d28d9' NOT NULL,
	"cor_secundaria" text DEFAULT '#0891b2' NOT NULL,
	"cor_fundo" text DEFAULT '#eaf1f9' NOT NULL,
	"cor_cartao" text DEFAULT '#ffffff' NOT NULL,
	"cor_sucesso" text DEFAULT '#16a34a' NOT NULL,
	"cor_aviso" text DEFAULT '#f59e0b' NOT NULL,
	"cor_erro" text DEFAULT '#ef4444' NOT NULL,
	"atualizado_por" text,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "configuracoes_tema_unica" CHECK ("configuracoes_tema"."id")
);
--> statement-breakpoint
CREATE TABLE "configuracoes_temas_telas" (
	"tela" text PRIMARY KEY NOT NULL,
	"cor_primaria" text DEFAULT '#6d28d9' NOT NULL,
	"cor_secundaria" text DEFAULT '#0891b2' NOT NULL,
	"cor_fundo" text DEFAULT '#eaf1f9' NOT NULL,
	"cor_cartao" text DEFAULT '#ffffff' NOT NULL,
	"cor_sucesso" text DEFAULT '#16a34a' NOT NULL,
	"cor_aviso" text DEFAULT '#f59e0b' NOT NULL,
	"cor_erro" text DEFAULT '#ef4444' NOT NULL,
	"atualizado_por" text,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"importado_de" uuid,
	"id_importado" uuid
);
--> statement-breakpoint
CREATE TABLE "empresas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fechamentos_caixa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"colaborador_id" uuid NOT NULL,
	"data_movimento" date NOT NULL,
	"total_entradas" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total_transferencias" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total_despesas" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total_retiradas" numeric(14, 2) DEFAULT '0' NOT NULL,
	"saldo" numeric(14, 2) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'aberto' NOT NULL,
	"criado_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fechamentos_caixa_status_check" CHECK ("fechamentos_caixa"."status" in ('aberto', 'fechado', 'ajustado'))
);
--> statement-breakpoint
CREATE TABLE "feriados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"dia" integer NOT NULL,
	"mes" integer NOT NULL,
	"ano" integer,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"importado_de" uuid,
	"id_importado" uuid,
	CONSTRAINT "feriados_dia_check" CHECK ("feriados"."dia" between 1 and 31),
	CONSTRAINT "feriados_mes_check" CHECK ("feriados"."mes" between 1 and 12),
	CONSTRAINT "feriados_ano_check" CHECK ("feriados"."ano" between 1900 and 9999)
);
--> statement-breakpoint
CREATE TABLE "fornecedores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"documento" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"importado_de" uuid,
	"id_importado" uuid
);
--> statement-breakpoint
CREATE TABLE "grupos_despesas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"grupo_pai_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"importado_de" uuid,
	"id_importado" uuid
);
--> statement-breakpoint
CREATE TABLE "grupos_mercadorias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"grupo_pai_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"importado_de" uuid,
	"id_importado" uuid
);
--> statement-breakpoint
CREATE TABLE "grupos_retiradas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"grupo_pai_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"importado_de" uuid,
	"id_importado" uuid
);
--> statement-breakpoint
CREATE TABLE "itens_despesas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"movimentacao_id" uuid NOT NULL,
	"grupo_despesa_id" uuid,
	"descricao" text NOT NULL,
	"valor" numeric(14, 2) NOT NULL,
	CONSTRAINT "itens_despesas_valor_check" CHECK ("itens_despesas"."valor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "itens_mercadorias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"movimentacao_id" uuid NOT NULL,
	"produto_id" uuid,
	"grupo_mercadoria_id" uuid,
	"unidade_medida_id" uuid,
	"descricao" text NOT NULL,
	"quantidade" numeric(14, 3) NOT NULL,
	"valor_unitario" numeric(14, 4) DEFAULT '0' NOT NULL,
	"valor_total" numeric(14, 2) NOT NULL,
	CONSTRAINT "itens_mercadorias_quantidade_check" CHECK ("itens_mercadorias"."quantidade" > 0),
	CONSTRAINT "itens_mercadorias_valor_total_check" CHECK ("itens_mercadorias"."valor_total" >= 0)
);
--> statement-breakpoint
CREATE TABLE "itens_vendas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
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
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"malote_id" uuid NOT NULL,
	"numero" text NOT NULL,
	"status" text DEFAULT 'disponivel' NOT NULL,
	"usado_em" timestamp with time zone,
	CONSTRAINT "lacres_malotes_malote_id_numero_key" UNIQUE("malote_id","numero"),
	CONSTRAINT "lacres_malotes_status_check" CHECK ("lacres_malotes"."status" in ('disponivel', 'usado', 'cancelado'))
);
--> statement-breakpoint
CREATE TABLE "malotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
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
CREATE TABLE "movimentacoes_financeiras" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"data_referencia" date NOT NULL,
	"data_vencimento" date,
	"data_pagamento" date,
	"descricao" text NOT NULL,
	"observacao" text,
	"valor_original" numeric(14, 2) NOT NULL,
	"valor_acrescimo" numeric(14, 2) DEFAULT '0' NOT NULL,
	"descricao_acrescimo" text,
	"valor_desconto" numeric(14, 2) DEFAULT '0' NOT NULL,
	"descricao_desconto" text,
	"conta_origem_id" uuid,
	"conta_destino_id" uuid,
	"fornecedor_id" uuid,
	"colaborador_id" uuid,
	"grupo_despesa_id" uuid,
	"grupo_mercadoria_id" uuid,
	"grupo_retirada_id" uuid,
	"malote_id" uuid,
	"lacre_malote_id" uuid,
	"nota_fiscal_id" text,
	"tem_nota_fiscal" boolean DEFAULT false NOT NULL,
	"computar" boolean DEFAULT true NOT NULL,
	"foto_documento_url" text,
	"status" text DEFAULT 'aprovado' NOT NULL,
	"criado_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "movimentacoes_financeiras_tipo_check" CHECK ("movimentacoes_financeiras"."tipo" in ('entrada', 'despesa', 'transferencia', 'mercadoria', 'retirada')),
	CONSTRAINT "movimentacoes_financeiras_status_check" CHECK ("movimentacoes_financeiras"."status" in ('aprovado', 'aguardando_aprovacao', 'cancelado')),
	CONSTRAINT "movimentacoes_financeiras_valor_original_check" CHECK ("movimentacoes_financeiras"."valor_original" >= 0),
	CONSTRAINT "movimentacoes_financeiras_valor_acrescimo_check" CHECK ("movimentacoes_financeiras"."valor_acrescimo" >= 0),
	CONSTRAINT "movimentacoes_financeiras_valor_desconto_check" CHECK ("movimentacoes_financeiras"."valor_desconto" >= 0)
);
--> statement-breakpoint
CREATE TABLE "perfis_usuarios" (
	"usuario_id" text PRIMARY KEY NOT NULL,
	"empresa_id" uuid,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"papel" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "perfis_usuarios_email_unique" UNIQUE("email"),
	CONSTRAINT "perfis_usuarios_papel_check" CHECK ("perfis_usuarios"."papel" in ('caixa', 'tesouraria', 'gerencia', 'compras', 'dp', 'rh', 'fiscal', 'diretor_operacoes', 'diretor_geral', 'financeiro'))
);
--> statement-breakpoint
CREATE TABLE "permissoes_papeis" (
	"papel" text NOT NULL,
	"permissao_codigo" text NOT NULL,
	CONSTRAINT "permissoes_papeis_papel_permissao_codigo_pk" PRIMARY KEY("papel","permissao_codigo")
);
--> statement-breakpoint
CREATE TABLE "permissoes_setores" (
	"setor_id" uuid NOT NULL,
	"permissao_codigo" text NOT NULL,
	CONSTRAINT "permissoes_setores_setor_id_permissao_codigo_pk" PRIMARY KEY("setor_id","permissao_codigo")
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
	"permissao_codigo" text NOT NULL,
	CONSTRAINT "permissoes_usuarios_usuario_id_permissao_codigo_pk" PRIMARY KEY("usuario_id","permissao_codigo")
);
--> statement-breakpoint
CREATE TABLE "produtos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"grupo_mercadoria_id" uuid,
	"unidade_medida_id" uuid,
	"codigo" text,
	"codigo_barras" text,
	"descricao" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"importado_de" uuid,
	"id_importado" uuid
);
--> statement-breakpoint
CREATE TABLE "setores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"area_id" uuid,
	"setor_pai_id" uuid,
	"nome" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"importado_de" uuid,
	"id_importado" uuid
);
--> statement-breakpoint
CREATE TABLE "unidades_medida" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
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
-- Better Auth cria account/session/user/verification antes desta migration no fluxo de producao.
--> statement-breakpoint
ALTER TABLE "ajustes_fechamento_caixa" ADD CONSTRAINT "ajustes_fechamento_caixa_fechamento_caixa_id_fechamentos_caixa_id_fk" FOREIGN KEY ("fechamento_caixa_id") REFERENCES "public"."fechamentos_caixa"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ajustes_fechamento_caixa" ADD CONSTRAINT "ajustes_fechamento_caixa_movimentacao_id_movimentacoes_financeiras_id_fk" FOREIGN KEY ("movimentacao_id") REFERENCES "public"."movimentacoes_financeiras"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "areas" ADD CONSTRAINT "areas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "areas" ADD CONSTRAINT "areas_importado_de_empresas_id_fk" FOREIGN KEY ("importado_de") REFERENCES "public"."empresas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cargos" ADD CONSTRAINT "cargos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cargos" ADD CONSTRAINT "cargos_importado_de_empresas_id_fk" FOREIGN KEY ("importado_de") REFERENCES "public"."empresas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colaboradores" ADD CONSTRAINT "colaboradores_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colaboradores" ADD CONSTRAINT "colaboradores_setor_id_setores_id_fk" FOREIGN KEY ("setor_id") REFERENCES "public"."setores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "fechamentos_caixa" ADD CONSTRAINT "fechamentos_caixa_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fechamentos_caixa" ADD CONSTRAINT "fechamentos_caixa_colaborador_id_colaboradores_id_fk" FOREIGN KEY ("colaborador_id") REFERENCES "public"."colaboradores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feriados" ADD CONSTRAINT "feriados_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feriados" ADD CONSTRAINT "feriados_importado_de_empresas_id_fk" FOREIGN KEY ("importado_de") REFERENCES "public"."empresas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "itens_despesas" ADD CONSTRAINT "itens_despesas_movimentacao_id_movimentacoes_financeiras_id_fk" FOREIGN KEY ("movimentacao_id") REFERENCES "public"."movimentacoes_financeiras"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itens_despesas" ADD CONSTRAINT "itens_despesas_grupo_despesa_id_grupos_despesas_id_fk" FOREIGN KEY ("grupo_despesa_id") REFERENCES "public"."grupos_despesas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itens_mercadorias" ADD CONSTRAINT "itens_mercadorias_movimentacao_id_movimentacoes_financeiras_id_fk" FOREIGN KEY ("movimentacao_id") REFERENCES "public"."movimentacoes_financeiras"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itens_mercadorias" ADD CONSTRAINT "itens_mercadorias_produto_id_produtos_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."produtos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itens_mercadorias" ADD CONSTRAINT "itens_mercadorias_grupo_mercadoria_id_grupos_mercadorias_id_fk" FOREIGN KEY ("grupo_mercadoria_id") REFERENCES "public"."grupos_mercadorias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itens_mercadorias" ADD CONSTRAINT "itens_mercadorias_unidade_medida_id_unidades_medida_id_fk" FOREIGN KEY ("unidade_medida_id") REFERENCES "public"."unidades_medida"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itens_vendas" ADD CONSTRAINT "itens_vendas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itens_vendas" ADD CONSTRAINT "itens_vendas_produto_id_produtos_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."produtos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lacres_malotes" ADD CONSTRAINT "lacres_malotes_malote_id_malotes_id_fk" FOREIGN KEY ("malote_id") REFERENCES "public"."malotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "malotes" ADD CONSTRAINT "malotes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "malotes" ADD CONSTRAINT "malotes_importado_de_empresas_id_fk" FOREIGN KEY ("importado_de") REFERENCES "public"."empresas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentacoes_financeiras" ADD CONSTRAINT "movimentacoes_financeiras_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentacoes_financeiras" ADD CONSTRAINT "movimentacoes_financeiras_conta_origem_id_contas_id_fk" FOREIGN KEY ("conta_origem_id") REFERENCES "public"."contas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentacoes_financeiras" ADD CONSTRAINT "movimentacoes_financeiras_conta_destino_id_contas_id_fk" FOREIGN KEY ("conta_destino_id") REFERENCES "public"."contas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentacoes_financeiras" ADD CONSTRAINT "movimentacoes_financeiras_fornecedor_id_fornecedores_id_fk" FOREIGN KEY ("fornecedor_id") REFERENCES "public"."fornecedores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentacoes_financeiras" ADD CONSTRAINT "movimentacoes_financeiras_colaborador_id_colaboradores_id_fk" FOREIGN KEY ("colaborador_id") REFERENCES "public"."colaboradores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentacoes_financeiras" ADD CONSTRAINT "movimentacoes_financeiras_grupo_despesa_id_grupos_despesas_id_fk" FOREIGN KEY ("grupo_despesa_id") REFERENCES "public"."grupos_despesas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentacoes_financeiras" ADD CONSTRAINT "movimentacoes_financeiras_grupo_mercadoria_id_grupos_mercadorias_id_fk" FOREIGN KEY ("grupo_mercadoria_id") REFERENCES "public"."grupos_mercadorias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentacoes_financeiras" ADD CONSTRAINT "movimentacoes_financeiras_grupo_retirada_id_grupos_retiradas_id_fk" FOREIGN KEY ("grupo_retirada_id") REFERENCES "public"."grupos_retiradas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentacoes_financeiras" ADD CONSTRAINT "movimentacoes_financeiras_malote_id_malotes_id_fk" FOREIGN KEY ("malote_id") REFERENCES "public"."malotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentacoes_financeiras" ADD CONSTRAINT "movimentacoes_financeiras_lacre_malote_id_lacres_malotes_id_fk" FOREIGN KEY ("lacre_malote_id") REFERENCES "public"."lacres_malotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perfis_usuarios" ADD CONSTRAINT "perfis_usuarios_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permissoes_papeis" ADD CONSTRAINT "permissoes_papeis_permissao_codigo_permissoes_codigo_fk" FOREIGN KEY ("permissao_codigo") REFERENCES "public"."permissoes"("codigo") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permissoes_setores" ADD CONSTRAINT "permissoes_setores_setor_id_setores_id_fk" FOREIGN KEY ("setor_id") REFERENCES "public"."setores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permissoes_setores" ADD CONSTRAINT "permissoes_setores_permissao_codigo_permissoes_codigo_fk" FOREIGN KEY ("permissao_codigo") REFERENCES "public"."permissoes"("codigo") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permissoes_usuarios" ADD CONSTRAINT "permissoes_usuarios_usuario_id_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permissoes_usuarios" ADD CONSTRAINT "permissoes_usuarios_permissao_codigo_permissoes_codigo_fk" FOREIGN KEY ("permissao_codigo") REFERENCES "public"."permissoes"("codigo") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_grupo_mercadoria_id_grupos_mercadorias_id_fk" FOREIGN KEY ("grupo_mercadoria_id") REFERENCES "public"."grupos_mercadorias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_unidade_medida_id_unidades_medida_id_fk" FOREIGN KEY ("unidade_medida_id") REFERENCES "public"."unidades_medida"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_importado_de_empresas_id_fk" FOREIGN KEY ("importado_de") REFERENCES "public"."empresas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setores" ADD CONSTRAINT "setores_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setores" ADD CONSTRAINT "setores_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setores" ADD CONSTRAINT "setores_setor_pai_id_setores_id_fk" FOREIGN KEY ("setor_pai_id") REFERENCES "public"."setores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setores" ADD CONSTRAINT "setores_importado_de_empresas_id_fk" FOREIGN KEY ("importado_de") REFERENCES "public"."empresas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unidades_medida" ADD CONSTRAINT "unidades_medida_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unidades_medida" ADD CONSTRAINT "unidades_medida_importado_de_empresas_id_fk" FOREIGN KEY ("importado_de") REFERENCES "public"."empresas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios_empresas" ADD CONSTRAINT "usuarios_empresas_usuario_id_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios_empresas" ADD CONSTRAINT "usuarios_empresas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "feriados_empresa_data_unica_idx" ON "feriados" USING btree ("empresa_id","dia","mes",coalesce("ano", 0),lower("nome"));--> statement-breakpoint
CREATE UNIQUE INDEX "lacres_malotes_numero_unico_idx" ON "lacres_malotes" USING btree (lower("numero"));--> statement-breakpoint
