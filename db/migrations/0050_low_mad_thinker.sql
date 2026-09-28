CREATE TABLE "colaboradores_eventos" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"colaborador_id" uuid NOT NULL,
	"vinculo_id" uuid,
	"processo_id" uuid,
	"tipo" text NOT NULL,
	"campos_alterados" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ator_usuario_id" text NOT NULL,
	"ocorrido_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "colaboradores_eventos_tipo_check" CHECK ("colaboradores_eventos"."tipo" in ('efetivado', 'recontratado', 'dados_cadastrais_atualizados', 'vinculo_desligado'))
);
--> statement-breakpoint
CREATE TABLE "colaboradores_vinculos" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"colaborador_id" uuid NOT NULL,
	"processo_id" uuid NOT NULL,
	"numero_sequencial" integer NOT NULL,
	"matricula" text NOT NULL,
	"status" text DEFAULT 'ativo' NOT NULL,
	"admitido_em" date NOT NULL,
	"desligado_em" timestamp with time zone,
	"desligado_por" text,
	"motivo_desligamento" text,
	"funcao_id" uuid NOT NULL,
	"funcao_nome" text NOT NULL,
	"funcao_cbo" text,
	"turno_id" uuid,
	"turno_rotulo" text,
	"turno_etiqueta" text,
	"turno_hora_inicio" time,
	"turno_hora_fim" time,
	"turno_dias_semana" text[],
	"jornada_horario" text,
	"criado_por" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "colaboradores_vinculos_processo_unico" UNIQUE("processo_id"),
	CONSTRAINT "colaboradores_vinculos_id_empresa_unica" UNIQUE("id","empresa_id"),
	CONSTRAINT "colaboradores_vinculos_empresa_numero_unico" UNIQUE("empresa_id","numero_sequencial"),
	CONSTRAINT "colaboradores_vinculos_empresa_matricula_unica" UNIQUE("empresa_id","matricula"),
	CONSTRAINT "colaboradores_vinculos_numero_check" CHECK ("colaboradores_vinculos"."numero_sequencial" > 0),
	CONSTRAINT "colaboradores_vinculos_matricula_check" CHECK ("colaboradores_vinculos"."matricula" ~ '^[A-Z0-9]{2,8}-[0-9]{6}$'),
	CONSTRAINT "colaboradores_vinculos_status_check" CHECK ("colaboradores_vinculos"."status" in ('ativo', 'desligado')),
	CONSTRAINT "colaboradores_vinculos_funcao_nome_check" CHECK (length(btrim("colaboradores_vinculos"."funcao_nome")) > 0),
	CONSTRAINT "colaboradores_vinculos_funcao_cbo_check" CHECK ("colaboradores_vinculos"."funcao_cbo" is null or "colaboradores_vinculos"."funcao_cbo" ~ '^[0-9]{6}$'),
	CONSTRAINT "colaboradores_vinculos_turno_retrato_check" CHECK ((
        "colaboradores_vinculos"."turno_id" is null
        and "colaboradores_vinculos"."turno_rotulo" is null and "colaboradores_vinculos"."turno_etiqueta" is null
        and "colaboradores_vinculos"."turno_hora_inicio" is null and "colaboradores_vinculos"."turno_hora_fim" is null and "colaboradores_vinculos"."turno_dias_semana" is null
      ) or (
        "colaboradores_vinculos"."turno_id" is not null
        and "colaboradores_vinculos"."turno_rotulo" is not null and "colaboradores_vinculos"."turno_etiqueta" is not null
        and "colaboradores_vinculos"."turno_hora_inicio" is not null and "colaboradores_vinculos"."turno_hora_fim" is not null and "colaboradores_vinculos"."turno_dias_semana" is not null
      )),
	CONSTRAINT "colaboradores_vinculos_jornada_check" CHECK (("colaboradores_vinculos"."turno_id" is not null and "colaboradores_vinculos"."jornada_horario" is null) or ("colaboradores_vinculos"."turno_id" is null and "colaboradores_vinculos"."jornada_horario" is not null and length(btrim("colaboradores_vinculos"."jornada_horario")) > 0)),
	CONSTRAINT "colaboradores_vinculos_desligamento_check" CHECK ((
        "colaboradores_vinculos"."status" = 'ativo'
        and "colaboradores_vinculos"."desligado_em" is null and "colaboradores_vinculos"."desligado_por" is null and "colaboradores_vinculos"."motivo_desligamento" is null
      ) or (
        "colaboradores_vinculos"."status" = 'desligado'
        and "colaboradores_vinculos"."desligado_em" is not null and "colaboradores_vinculos"."desligado_por" is not null
        and "colaboradores_vinculos"."motivo_desligamento" is not null and length(btrim("colaboradores_vinculos"."motivo_desligamento")) > 0
      ))
);
--> statement-breakpoint
CREATE TABLE "colaboradores_vinculos_desligamento_etapas" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"vinculo_id" uuid NOT NULL,
	"descricao" text NOT NULL,
	"status" text DEFAULT 'pendente' NOT NULL,
	"observacao" text,
	"concluido_em" timestamp with time zone,
	"concluido_por" text,
	"criado_por" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "colaboradores_vinculos_desligamento_etapas_descricao_check" CHECK (length(btrim("colaboradores_vinculos_desligamento_etapas"."descricao")) > 0),
	CONSTRAINT "colaboradores_vinculos_desligamento_etapas_status_check" CHECK ("colaboradores_vinculos_desligamento_etapas"."status" in ('pendente', 'concluido', 'dispensado')),
	CONSTRAINT "colaboradores_vinculos_desligamento_etapas_conclusao_check" CHECK (("colaboradores_vinculos_desligamento_etapas"."status" = 'concluido' and "colaboradores_vinculos_desligamento_etapas"."concluido_em" is not null and "colaboradores_vinculos_desligamento_etapas"."concluido_por" is not null) or ("colaboradores_vinculos_desligamento_etapas"."status" <> 'concluido' and "colaboradores_vinculos_desligamento_etapas"."concluido_em" is null and "colaboradores_vinculos_desligamento_etapas"."concluido_por" is null))
);
--> statement-breakpoint
ALTER TABLE "admissoes_processos_historico" DROP CONSTRAINT "admissoes_processos_historico_acao_check";--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "matricula_prefixo" text DEFAULT 'TNP' NOT NULL;--> statement-breakpoint
ALTER TABLE "colaboradores_eventos" ADD CONSTRAINT "colaboradores_eventos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colaboradores_eventos" ADD CONSTRAINT "colaboradores_eventos_ator_usuario_id_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("ator_usuario_id") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colaboradores_eventos" ADD CONSTRAINT "colaboradores_eventos_colaborador_empresa_fk" FOREIGN KEY ("colaborador_id","empresa_id") REFERENCES "public"."colaboradores"("id","empresa_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colaboradores_eventos" ADD CONSTRAINT "colaboradores_eventos_vinculo_empresa_fk" FOREIGN KEY ("vinculo_id","empresa_id") REFERENCES "public"."colaboradores_vinculos"("id","empresa_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colaboradores_eventos" ADD CONSTRAINT "colaboradores_eventos_processo_empresa_fk" FOREIGN KEY ("processo_id","empresa_id") REFERENCES "public"."admissoes_processos"("id","empresa_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colaboradores_vinculos" ADD CONSTRAINT "colaboradores_vinculos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colaboradores_vinculos" ADD CONSTRAINT "colaboradores_vinculos_desligado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("desligado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colaboradores_vinculos" ADD CONSTRAINT "colaboradores_vinculos_criado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colaboradores_vinculos" ADD CONSTRAINT "colaboradores_vinculos_colaborador_empresa_fk" FOREIGN KEY ("colaborador_id","empresa_id") REFERENCES "public"."colaboradores"("id","empresa_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colaboradores_vinculos" ADD CONSTRAINT "colaboradores_vinculos_processo_empresa_fk" FOREIGN KEY ("processo_id","empresa_id") REFERENCES "public"."admissoes_processos"("id","empresa_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colaboradores_vinculos" ADD CONSTRAINT "colaboradores_vinculos_funcao_empresa_fk" FOREIGN KEY ("funcao_id","empresa_id") REFERENCES "public"."funcoes_operacionais"("id","empresa_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colaboradores_vinculos" ADD CONSTRAINT "colaboradores_vinculos_turno_empresa_fk" FOREIGN KEY ("turno_id","empresa_id") REFERENCES "public"."turnos"("id","empresa_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colaboradores_vinculos_desligamento_etapas" ADD CONSTRAINT "colaboradores_vinculos_desligamento_etapas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colaboradores_vinculos_desligamento_etapas" ADD CONSTRAINT "colaboradores_vinculos_desligamento_etapas_concluido_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("concluido_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colaboradores_vinculos_desligamento_etapas" ADD CONSTRAINT "colaboradores_vinculos_desligamento_etapas_criado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colaboradores_vinculos_desligamento_etapas" ADD CONSTRAINT "colaboradores_vinculos_desligamento_etapas_vinculo_empresa_fk" FOREIGN KEY ("vinculo_id","empresa_id") REFERENCES "public"."colaboradores_vinculos"("id","empresa_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "colaboradores_eventos_empresa_colaborador_idx" ON "colaboradores_eventos" USING btree ("empresa_id","colaborador_id","ocorrido_em","id");--> statement-breakpoint
CREATE UNIQUE INDEX "colaboradores_vinculos_colaborador_ativo_unico" ON "colaboradores_vinculos" USING btree ("colaborador_id") WHERE "colaboradores_vinculos"."status" = 'ativo';--> statement-breakpoint
CREATE INDEX "colaboradores_vinculos_empresa_colaborador_idx" ON "colaboradores_vinculos" USING btree ("empresa_id","colaborador_id","criado_em");--> statement-breakpoint
CREATE INDEX "colaboradores_vinculos_empresa_status_idx" ON "colaboradores_vinculos" USING btree ("empresa_id","status","admitido_em");--> statement-breakpoint
CREATE INDEX "colaboradores_vinculos_desligamento_etapas_empresa_vinculo_idx" ON "colaboradores_vinculos_desligamento_etapas" USING btree ("empresa_id","vinculo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "colaboradores_empresa_cpf_unico" ON "colaboradores" USING btree ("empresa_id",regexp_replace("cpf", '\D', '', 'g')) WHERE regexp_replace("cpf", '\D', '', 'g') ~ '^[0-9]{11}$';--> statement-breakpoint
ALTER TABLE "colaboradores" ADD CONSTRAINT "colaboradores_id_empresa_unica" UNIQUE("id","empresa_id");--> statement-breakpoint
ALTER TABLE "admissoes_processos_historico" ADD CONSTRAINT "admissoes_processos_historico_acao_check" CHECK ("admissoes_processos_historico"."acao" in ('criado', 'cancelado', 'internos_alterados', 'exame_alterado', 'pausado', 'retomado', 'cpf_revelado', 'convite_gerado', 'convite_revogado', 'ficha_enviada', 'ficha_devolvida', 'ficha_aprovada', 'efetivado'));--> statement-breakpoint
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_matricula_prefixo_check" CHECK ("empresas"."matricula_prefixo" ~ '^[A-Z0-9]{2,8}$');
