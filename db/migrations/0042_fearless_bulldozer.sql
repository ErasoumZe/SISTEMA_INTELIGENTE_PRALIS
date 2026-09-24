CREATE TABLE "admissoes_convites" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"processo_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"aviso_privacidade_versao" text NOT NULL,
	"criado_por" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"primeiro_acesso_em" timestamp with time zone,
	"ultimo_acesso_em" timestamp with time zone,
	"revogado_em" timestamp with time zone,
	"revogado_por" text,
	CONSTRAINT "admissoes_convites_id_empresa_unica" UNIQUE("id","empresa_id"),
	CONSTRAINT "admissoes_convites_token_hash_unico" UNIQUE("token_hash"),
	CONSTRAINT "admissoes_convites_token_hash_check" CHECK ("admissoes_convites"."token_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "admissoes_convites_validade_check" CHECK ("admissoes_convites"."expira_em" > "admissoes_convites"."criado_em"),
	CONSTRAINT "admissoes_convites_revogacao_check" CHECK (num_nonnulls("admissoes_convites"."revogado_em", "admissoes_convites"."revogado_por") <> 1),
	CONSTRAINT "admissoes_convites_acesso_check" CHECK ("admissoes_convites"."ultimo_acesso_em" is null or "admissoes_convites"."primeiro_acesso_em" is not null)
);
--> statement-breakpoint
CREATE TABLE "admissoes_processos" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"origem" text DEFAULT 'teste_efetivado' NOT NULL,
	"teste_id" uuid,
	"nome_completo" text,
	"cpf" text,
	"funcao_id" uuid,
	"turno_id" uuid,
	"jornada_horario" text,
	"turno_rotulo" text,
	"turno_etiqueta" text,
	"turno_hora_inicio" time,
	"turno_hora_fim" time,
	"turno_dias_semana" text[],
	"status" text DEFAULT 'iniciado' NOT NULL,
	"versao" integer DEFAULT 1 NOT NULL,
	"criado_por" text NOT NULL,
	"atualizado_por" text NOT NULL,
	"cancelado_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelado_em" timestamp with time zone,
	CONSTRAINT "admissoes_processos_teste_unico" UNIQUE("teste_id"),
	CONSTRAINT "admissoes_processos_id_empresa_unica" UNIQUE("id","empresa_id"),
	CONSTRAINT "admissoes_processos_status_check" CHECK ("admissoes_processos"."status" in ('iniciado', 'pausado', 'cancelado')),
	CONSTRAINT "admissoes_processos_versao_check" CHECK ("admissoes_processos"."versao" > 0),
	CONSTRAINT "admissoes_processos_coerencia_status_check" CHECK ((
        "admissoes_processos"."status" in ('iniciado', 'pausado')
        and "admissoes_processos"."cancelado_por" is null and "admissoes_processos"."cancelado_em" is null
      ) or (
        "admissoes_processos"."status" = 'cancelado'
        and "admissoes_processos"."cancelado_por" is not null and "admissoes_processos"."cancelado_em" is not null
      )),
	CONSTRAINT "admissoes_processos_nome_check" CHECK ("admissoes_processos"."nome_completo" is null or length(btrim("admissoes_processos"."nome_completo")) > 0),
	CONSTRAINT "admissoes_processos_cpf_check" CHECK ("admissoes_processos"."cpf" is null or "admissoes_processos"."cpf" ~ '^[0-9]{11}$'),
	CONSTRAINT "admissoes_processos_origem_check" CHECK ("admissoes_processos"."origem" in ('teste_efetivado', 'admissao_direta')),
	CONSTRAINT "admissoes_processos_origem_coerencia_check" CHECK ((
        "admissoes_processos"."origem" = 'teste_efetivado'
        and "admissoes_processos"."teste_id" is not null
        and "admissoes_processos"."nome_completo" is null and "admissoes_processos"."cpf" is null
        and "admissoes_processos"."funcao_id" is null and "admissoes_processos"."turno_id" is null
        and "admissoes_processos"."jornada_horario" is null
      ) or (
        "admissoes_processos"."origem" = 'admissao_direta'
        and "admissoes_processos"."teste_id" is null
        and "admissoes_processos"."nome_completo" is not null and "admissoes_processos"."cpf" is not null
        and "admissoes_processos"."funcao_id" is not null and "admissoes_processos"."turno_id" is not null
      ))
);
--> statement-breakpoint
CREATE TABLE "admissoes_processos_dependentes" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"processo_id" uuid NOT NULL,
	"nome_completo" text NOT NULL,
	"nascimento" date NOT NULL,
	"parentesco" text NOT NULL,
	"cpf" text,
	"finalidades" text[] DEFAULT '{}'::text[] NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admissoes_processos_dependentes_nome_check" CHECK (length(btrim("admissoes_processos_dependentes"."nome_completo")) > 0),
	CONSTRAINT "admissoes_processos_dependentes_cpf_check" CHECK ("admissoes_processos_dependentes"."cpf" is null or case
        when "admissoes_processos_dependentes"."cpf" !~ '^[0-9]{11}$' then false
        when "admissoes_processos_dependentes"."cpf" = repeat(substring("admissoes_processos_dependentes"."cpf", 1, 1), 11) then false
        else
          substring("admissoes_processos_dependentes"."cpf", 10, 1)::int = (((
            10 * substring("admissoes_processos_dependentes"."cpf", 1, 1)::int + 9 * substring("admissoes_processos_dependentes"."cpf", 2, 1)::int + 8 * substring("admissoes_processos_dependentes"."cpf", 3, 1)::int +
            7 * substring("admissoes_processos_dependentes"."cpf", 4, 1)::int + 6 * substring("admissoes_processos_dependentes"."cpf", 5, 1)::int + 5 * substring("admissoes_processos_dependentes"."cpf", 6, 1)::int +
            4 * substring("admissoes_processos_dependentes"."cpf", 7, 1)::int + 3 * substring("admissoes_processos_dependentes"."cpf", 8, 1)::int + 2 * substring("admissoes_processos_dependentes"."cpf", 9, 1)::int
            ) * 10) % 11) % 10
          and substring("admissoes_processos_dependentes"."cpf", 11, 1)::int = (((
            11 * substring("admissoes_processos_dependentes"."cpf", 1, 1)::int + 10 * substring("admissoes_processos_dependentes"."cpf", 2, 1)::int + 9 * substring("admissoes_processos_dependentes"."cpf", 3, 1)::int +
            8 * substring("admissoes_processos_dependentes"."cpf", 4, 1)::int + 7 * substring("admissoes_processos_dependentes"."cpf", 5, 1)::int + 6 * substring("admissoes_processos_dependentes"."cpf", 6, 1)::int +
            5 * substring("admissoes_processos_dependentes"."cpf", 7, 1)::int + 4 * substring("admissoes_processos_dependentes"."cpf", 8, 1)::int + 3 * substring("admissoes_processos_dependentes"."cpf", 9, 1)::int +
            2 * substring("admissoes_processos_dependentes"."cpf", 10, 1)::int
            ) * 10) % 11) % 10
      end)
);
--> statement-breakpoint
CREATE TABLE "admissoes_processos_ficha" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"processo_id" uuid NOT NULL,
	"situacao" text DEFAULT 'rascunho' NOT NULL,
	"versao" integer DEFAULT 1 NOT NULL,
	"nome_social" text,
	"nascimento" date,
	"sexo" text,
	"estado_civil" text,
	"raca_cor" text,
	"grau_instrucao" text,
	"nacionalidade" text,
	"naturalidade" text,
	"nome_mae" text,
	"nome_pai" text,
	"cep" text,
	"logradouro" text,
	"numero" text,
	"complemento" text,
	"bairro" text,
	"municipio" text,
	"uf" text,
	"telefone" text,
	"email" text,
	"rg_numero" text,
	"rg_orgao" text,
	"rg_uf" text,
	"rg_emissao" date,
	"titulo_eleitor" text,
	"titulo_zona" text,
	"titulo_secao" text,
	"banco" text,
	"agencia" text,
	"conta" text,
	"conta_digito" text,
	"conta_tipo" text,
	"sem_dependentes" boolean,
	"aviso_privacidade_versao" text,
	"aviso_aceito_em" timestamp with time zone,
	"enviado_em" timestamp with time zone,
	"revisado_em" timestamp with time zone,
	"revisado_por" text,
	"revisao_pendencias" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admissoes_processos_ficha_processo_unico" UNIQUE("processo_id"),
	CONSTRAINT "admissoes_processos_ficha_situacao_check" CHECK ("admissoes_processos_ficha"."situacao" in ('rascunho', 'enviada', 'devolvida', 'aprovada')),
	CONSTRAINT "admissoes_processos_ficha_versao_check" CHECK ("admissoes_processos_ficha"."versao" > 0),
	CONSTRAINT "admissoes_processos_ficha_uf_check" CHECK ("admissoes_processos_ficha"."uf" is null or "admissoes_processos_ficha"."uf" ~ '^[A-Z]{2}$'),
	CONSTRAINT "admissoes_processos_ficha_rg_uf_check" CHECK ("admissoes_processos_ficha"."rg_uf" is null or "admissoes_processos_ficha"."rg_uf" ~ '^[A-Z]{2}$'),
	CONSTRAINT "admissoes_processos_ficha_cep_check" CHECK ("admissoes_processos_ficha"."cep" is null or "admissoes_processos_ficha"."cep" ~ '^[0-9]{8}$'),
	CONSTRAINT "admissoes_processos_ficha_coerencia_check" CHECK ((
        ("admissoes_processos_ficha"."situacao" = 'rascunho' and "admissoes_processos_ficha"."enviado_em" is null and "admissoes_processos_ficha"."revisado_em" is null)
        or ("admissoes_processos_ficha"."situacao" = 'enviada' and "admissoes_processos_ficha"."enviado_em" is not null and "admissoes_processos_ficha"."revisado_em" is null
            and "admissoes_processos_ficha"."aviso_aceito_em" is not null and "admissoes_processos_ficha"."aviso_privacidade_versao" is not null
            and "admissoes_processos_ficha"."sem_dependentes" is not null)
        or ("admissoes_processos_ficha"."situacao" = 'devolvida' and "admissoes_processos_ficha"."enviado_em" is not null
            and "admissoes_processos_ficha"."revisado_em" is not null and "admissoes_processos_ficha"."revisado_por" is not null
            and "admissoes_processos_ficha"."revisao_pendencias" is not null)
        or ("admissoes_processos_ficha"."situacao" = 'aprovada' and "admissoes_processos_ficha"."enviado_em" is not null
            and "admissoes_processos_ficha"."revisado_em" is not null and "admissoes_processos_ficha"."revisado_por" is not null)
      ))
);
--> statement-breakpoint
CREATE TABLE "admissoes_processos_historico" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"processo_id" uuid NOT NULL,
	"versao" integer NOT NULL,
	"acao" text NOT NULL,
	"ator_usuario_id" text,
	"convite_id" uuid,
	"campos_alterados" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ocorrido_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admissoes_processos_historico_autoria_check" CHECK (num_nonnulls("admissoes_processos_historico"."ator_usuario_id", "admissoes_processos_historico"."convite_id") = 1),
	CONSTRAINT "admissoes_processos_historico_acao_check" CHECK ("admissoes_processos_historico"."acao" in ('criado', 'cancelado', 'internos_alterados', 'exame_alterado', 'pausado', 'retomado', 'cpf_revelado', 'convite_gerado', 'convite_revogado', 'ficha_enviada', 'ficha_devolvida', 'ficha_aprovada')),
	CONSTRAINT "admissoes_processos_historico_versao_check" CHECK ("admissoes_processos_historico"."versao" > 0)
);
--> statement-breakpoint
CREATE TABLE "admissoes_processos_internos" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"processo_id" uuid NOT NULL,
	"data_admissao" date,
	"ctps_numero" text,
	"ctps_serie" text,
	"ctps_uf" text,
	"pis_pasep_nit" text,
	"exame_situacao" text DEFAULT 'pendente' NOT NULL,
	"exame_atualizado_em" timestamp with time zone,
	"exame_atualizado_por" text,
	"observacoes_rh" text,
	"versao" integer DEFAULT 1 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admissoes_processos_internos_processo_unico" UNIQUE("processo_id"),
	CONSTRAINT "admissoes_processos_internos_exame_check" CHECK ("admissoes_processos_internos"."exame_situacao" in ('pendente', 'guia_entregue', 'agendado', 'aso_apto', 'aso_nao_apto', 'exige_acao')),
	CONSTRAINT "admissoes_processos_internos_versao_check" CHECK ("admissoes_processos_internos"."versao" > 0),
	CONSTRAINT "admissoes_processos_internos_ctps_uf_check" CHECK ("admissoes_processos_internos"."ctps_uf" is null or "admissoes_processos_internos"."ctps_uf" ~ '^[A-Z]{2}$'),
	CONSTRAINT "admissoes_processos_internos_pis_check" CHECK ("admissoes_processos_internos"."pis_pasep_nit" is null or "admissoes_processos_internos"."pis_pasep_nit" ~ '^[0-9]{11}$')
);
--> statement-breakpoint
CREATE TABLE "admissoes_testes" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"status" text DEFAULT 'em_teste' NOT NULL,
	"versao" integer DEFAULT 1 NOT NULL,
	"nome_completo" text NOT NULL,
	"cpf" text NOT NULL,
	"funcao_id" uuid NOT NULL,
	"jornada_horario" text NOT NULL,
	"inicio_em" timestamp with time zone NOT NULL,
	"fim_combinado_em" timestamp with time zone NOT NULL,
	"resultado" text,
	"motivo_cancelamento" text,
	"criado_por" text NOT NULL,
	"atualizado_por" text NOT NULL,
	"encerrado_por" text,
	"cancelado_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"encerrado_em" timestamp with time zone,
	"cancelado_em" timestamp with time zone,
	CONSTRAINT "admissoes_testes_id_empresa_unica" UNIQUE("id","empresa_id"),
	CONSTRAINT "admissoes_testes_status_check" CHECK ("admissoes_testes"."status" in ('em_teste', 'encerrado', 'cancelado')),
	CONSTRAINT "admissoes_testes_versao_check" CHECK ("admissoes_testes"."versao" > 0),
	CONSTRAINT "admissoes_testes_cpf_check" CHECK ("admissoes_testes"."cpf" ~ '^[0-9]{11}$'),
	CONSTRAINT "admissoes_testes_nome_check" CHECK (length(btrim("admissoes_testes"."nome_completo")) > 0),
	CONSTRAINT "admissoes_testes_jornada_check" CHECK (length(btrim("admissoes_testes"."jornada_horario")) > 0),
	CONSTRAINT "admissoes_testes_periodo_check" CHECK ("admissoes_testes"."fim_combinado_em" > "admissoes_testes"."inicio_em"),
	CONSTRAINT "admissoes_testes_resultado_check" CHECK ("admissoes_testes"."resultado" is null or "admissoes_testes"."resultado" in ('aprovado_para_admissao', 'nao_prosseguir')),
	CONSTRAINT "admissoes_testes_motivo_cancelamento_check" CHECK ("admissoes_testes"."motivo_cancelamento" is null or "admissoes_testes"."motivo_cancelamento" in ('nao_aprovado_no_teste', 'sem_continuidade_apos_dia_de_teste')),
	CONSTRAINT "admissoes_testes_coerencia_status_check" CHECK ((
        "admissoes_testes"."status" = 'em_teste'
        and "admissoes_testes"."resultado" is null
        and "admissoes_testes"."motivo_cancelamento" is null
        and "admissoes_testes"."encerrado_por" is null and "admissoes_testes"."encerrado_em" is null
        and "admissoes_testes"."cancelado_por" is null and "admissoes_testes"."cancelado_em" is null
      ) or (
        "admissoes_testes"."status" = 'encerrado'
        and "admissoes_testes"."resultado" is not null
        and "admissoes_testes"."motivo_cancelamento" is null
        and "admissoes_testes"."encerrado_por" is not null and "admissoes_testes"."encerrado_em" is not null
        and "admissoes_testes"."cancelado_por" is null and "admissoes_testes"."cancelado_em" is null
      ) or (
        "admissoes_testes"."status" = 'cancelado'
        and "admissoes_testes"."resultado" is null
        and "admissoes_testes"."motivo_cancelamento" is not null
        and "admissoes_testes"."encerrado_por" is null and "admissoes_testes"."encerrado_em" is null
        and "admissoes_testes"."cancelado_por" is not null and "admissoes_testes"."cancelado_em" is not null
      ))
);
--> statement-breakpoint
CREATE TABLE "admissoes_testes_historico" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"teste_id" uuid NOT NULL,
	"versao" integer NOT NULL,
	"acao" text NOT NULL,
	"ator_usuario_id" text NOT NULL,
	"campos_alterados" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ocorrido_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admissoes_testes_historico_acao_check" CHECK ("admissoes_testes_historico"."acao" in ('criado', 'alterado', 'encerrado', 'cancelado', 'cpf_revelado')),
	CONSTRAINT "admissoes_testes_historico_versao_check" CHECK ("admissoes_testes_historico"."versao" > 0)
);
--> statement-breakpoint
CREATE TABLE "funcoes_operacionais" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"cbo" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "funcoes_operacionais_empresa_nome_unica" UNIQUE("empresa_id","nome"),
	CONSTRAINT "funcoes_operacionais_id_empresa_unica" UNIQUE("id","empresa_id"),
	CONSTRAINT "funcoes_operacionais_nome_check" CHECK (length(btrim("funcoes_operacionais"."nome")) > 0),
	CONSTRAINT "funcoes_operacionais_cbo_check" CHECK ("funcoes_operacionais"."cbo" is null or "funcoes_operacionais"."cbo" ~ '^[0-9]{6}$')
);
--> statement-breakpoint
ALTER TABLE "turnos" ADD COLUMN "etiqueta" text;--> statement-breakpoint
ALTER TABLE "turnos" ADD COLUMN "dias_semana" text[];--> statement-breakpoint
-- A FK composta abaixo referencia (id, empresa_id); a unicidade precisa existir antes dela.
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_id_empresa_unica" UNIQUE("id","empresa_id");--> statement-breakpoint
ALTER TABLE "admissoes_convites" ADD CONSTRAINT "admissoes_convites_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_convites" ADD CONSTRAINT "admissoes_convites_criado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_convites" ADD CONSTRAINT "admissoes_convites_revogado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("revogado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_convites" ADD CONSTRAINT "admissoes_convites_processo_empresa_fk" FOREIGN KEY ("processo_id","empresa_id") REFERENCES "public"."admissoes_processos"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_processos" ADD CONSTRAINT "admissoes_processos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_processos" ADD CONSTRAINT "admissoes_processos_criado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_processos" ADD CONSTRAINT "admissoes_processos_atualizado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_processos" ADD CONSTRAINT "admissoes_processos_cancelado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("cancelado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_processos" ADD CONSTRAINT "admissoes_processos_teste_empresa_fk" FOREIGN KEY ("teste_id","empresa_id") REFERENCES "public"."admissoes_testes"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_processos" ADD CONSTRAINT "admissoes_processos_funcao_empresa_fk" FOREIGN KEY ("funcao_id","empresa_id") REFERENCES "public"."funcoes_operacionais"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_processos" ADD CONSTRAINT "admissoes_processos_turno_empresa_fk" FOREIGN KEY ("turno_id","empresa_id") REFERENCES "public"."turnos"("id","empresa_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_processos_dependentes" ADD CONSTRAINT "admissoes_processos_dependentes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_processos_dependentes" ADD CONSTRAINT "admissoes_processos_dependentes_processo_empresa_fk" FOREIGN KEY ("processo_id","empresa_id") REFERENCES "public"."admissoes_processos"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_processos_ficha" ADD CONSTRAINT "admissoes_processos_ficha_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_processos_ficha" ADD CONSTRAINT "admissoes_processos_ficha_revisado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("revisado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_processos_ficha" ADD CONSTRAINT "admissoes_processos_ficha_processo_empresa_fk" FOREIGN KEY ("processo_id","empresa_id") REFERENCES "public"."admissoes_processos"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_processos_historico" ADD CONSTRAINT "admissoes_processos_historico_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_processos_historico" ADD CONSTRAINT "admissoes_processos_historico_ator_usuario_id_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("ator_usuario_id") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_processos_historico" ADD CONSTRAINT "admissoes_processos_historico_processo_empresa_fk" FOREIGN KEY ("processo_id","empresa_id") REFERENCES "public"."admissoes_processos"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_processos_historico" ADD CONSTRAINT "admissoes_processos_historico_convite_empresa_fk" FOREIGN KEY ("convite_id","empresa_id") REFERENCES "public"."admissoes_convites"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_processos_internos" ADD CONSTRAINT "admissoes_processos_internos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_processos_internos" ADD CONSTRAINT "admissoes_processos_internos_exame_atualizado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("exame_atualizado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_processos_internos" ADD CONSTRAINT "admissoes_processos_internos_processo_empresa_fk" FOREIGN KEY ("processo_id","empresa_id") REFERENCES "public"."admissoes_processos"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_testes" ADD CONSTRAINT "admissoes_testes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_testes" ADD CONSTRAINT "admissoes_testes_criado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_testes" ADD CONSTRAINT "admissoes_testes_atualizado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_testes" ADD CONSTRAINT "admissoes_testes_encerrado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("encerrado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_testes" ADD CONSTRAINT "admissoes_testes_cancelado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("cancelado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_testes" ADD CONSTRAINT "admissoes_testes_funcao_empresa_fk" FOREIGN KEY ("funcao_id","empresa_id") REFERENCES "public"."funcoes_operacionais"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_testes_historico" ADD CONSTRAINT "admissoes_testes_historico_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_testes_historico" ADD CONSTRAINT "admissoes_testes_historico_ator_usuario_id_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("ator_usuario_id") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_testes_historico" ADD CONSTRAINT "admissoes_testes_historico_teste_empresa_fk" FOREIGN KEY ("teste_id","empresa_id") REFERENCES "public"."admissoes_testes"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funcoes_operacionais" ADD CONSTRAINT "funcoes_operacionais_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admissoes_convites_processo_vigente_unico" ON "admissoes_convites" USING btree ("processo_id") WHERE "admissoes_convites"."revogado_em" is null;--> statement-breakpoint
CREATE INDEX "admissoes_convites_empresa_processo_idx" ON "admissoes_convites" USING btree ("empresa_id","processo_id","criado_em");--> statement-breakpoint
CREATE UNIQUE INDEX "admissoes_processos_cpf_ativo_unico" ON "admissoes_processos" USING btree ("empresa_id","cpf") WHERE "admissoes_processos"."cpf" is not null and "admissoes_processos"."status" <> 'cancelado';--> statement-breakpoint
CREATE INDEX "admissoes_processos_empresa_status_criado_idx" ON "admissoes_processos" USING btree ("empresa_id","status","criado_em","id");--> statement-breakpoint
CREATE UNIQUE INDEX "admissoes_processos_dependentes_cpf_unico" ON "admissoes_processos_dependentes" USING btree ("processo_id","cpf") WHERE "admissoes_processos_dependentes"."cpf" is not null;--> statement-breakpoint
CREATE INDEX "admissoes_processos_dependentes_empresa_processo_idx" ON "admissoes_processos_dependentes" USING btree ("empresa_id","processo_id");--> statement-breakpoint
CREATE INDEX "admissoes_processos_ficha_empresa_situacao_idx" ON "admissoes_processos_ficha" USING btree ("empresa_id","situacao");--> statement-breakpoint
CREATE INDEX "admissoes_processos_ficha_aviso_teste_idx" ON "admissoes_processos_ficha" USING btree ("empresa_id") WHERE "admissoes_processos_ficha"."aviso_privacidade_versao" like 'AVISO-TESTE-%';--> statement-breakpoint
CREATE UNIQUE INDEX "admissoes_processos_historico_evento_unico" ON "admissoes_processos_historico" USING btree ("processo_id","versao") WHERE "admissoes_processos_historico"."acao" not in ('cpf_revelado', 'convite_gerado', 'convite_revogado', 'ficha_enviada', 'ficha_devolvida', 'ficha_aprovada');--> statement-breakpoint
CREATE INDEX "admissoes_processos_historico_processo_idx" ON "admissoes_processos_historico" USING btree ("empresa_id","processo_id","ocorrido_em","id");--> statement-breakpoint
CREATE INDEX "admissoes_processos_internos_exame_idx" ON "admissoes_processos_internos" USING btree ("empresa_id","exame_situacao");--> statement-breakpoint
CREATE UNIQUE INDEX "admissoes_testes_cpf_em_teste_unico" ON "admissoes_testes" USING btree ("empresa_id","cpf") WHERE "admissoes_testes"."status" = 'em_teste';--> statement-breakpoint
CREATE INDEX "admissoes_testes_empresa_status_fim_idx" ON "admissoes_testes" USING btree ("empresa_id","status","fim_combinado_em","id");--> statement-breakpoint
CREATE UNIQUE INDEX "admissoes_testes_historico_evento_unico" ON "admissoes_testes_historico" USING btree ("teste_id","versao") WHERE "admissoes_testes_historico"."acao" <> 'cpf_revelado';--> statement-breakpoint
CREATE INDEX "admissoes_testes_historico_teste_idx" ON "admissoes_testes_historico" USING btree ("empresa_id","teste_id","ocorrido_em","id");--> statement-breakpoint
CREATE INDEX "funcoes_operacionais_empresa_ativo_nome_idx" ON "funcoes_operacionais" USING btree ("empresa_id","ativo","nome");--> statement-breakpoint
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_etiqueta_check" CHECK ("turnos"."etiqueta" is null or "turnos"."etiqueta" in ('M', 'T', 'I'));--> statement-breakpoint
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_dias_semana_check" CHECK ("turnos"."dias_semana" is null or (
        array_length("turnos"."dias_semana", 1) > 0
        and "turnos"."dias_semana" <@ array['SEGUNDA','TERCA','QUARTA','QUINTA','SEXTA','SABADO','DOMINGO']::text[]
      ));
--> statement-breakpoint
-- Triggers manuais: o drizzle-kit nao os gera; a funcao set_atualizado_em vem da 0002.
create trigger "funcoes_operacionais_set_atualizado_em" before update on "funcoes_operacionais" for each row execute function set_atualizado_em();
--> statement-breakpoint
create trigger "admissoes_testes_set_atualizado_em" before update on "admissoes_testes" for each row execute function set_atualizado_em();
--> statement-breakpoint
create trigger "admissoes_processos_set_atualizado_em" before update on "admissoes_processos" for each row execute function set_atualizado_em();
--> statement-breakpoint
create trigger "admissoes_processos_internos_set_atualizado_em" before update on "admissoes_processos_internos" for each row execute function set_atualizado_em();
--> statement-breakpoint
create trigger "admissoes_processos_ficha_set_atualizado_em" before update on "admissoes_processos_ficha" for each row execute function set_atualizado_em();
--> statement-breakpoint
create trigger "admissoes_processos_dependentes_set_atualizado_em" before update on "admissoes_processos_dependentes" for each row execute function set_atualizado_em();
