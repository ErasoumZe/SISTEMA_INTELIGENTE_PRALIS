CREATE TABLE "pedidos_agenda_ocorrencias" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"agenda_id" uuid NOT NULL,
	"previsto_para" timestamp with time zone NOT NULL,
	"data_atual" timestamp with time zone NOT NULL,
	"situacao" text DEFAULT 'aguardando_conferencia' NOT NULL,
	"solicitacao_id" uuid,
	"enviada_por" text,
	"enviada_em" timestamp with time zone,
	"cancelada_por" text,
	"cancelada_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pedidos_agenda_ocorrencias_unica" UNIQUE("agenda_id","previsto_para"),
	CONSTRAINT "pedidos_agenda_ocorrencias_situacao_check" CHECK ("pedidos_agenda_ocorrencias"."situacao" in ('agendada', 'aguardando_conferencia', 'enviada', 'cancelada')),
	CONSTRAINT "pedidos_agenda_ocorrencias_conferencia_check" CHECK ("pedidos_agenda_ocorrencias"."situacao" not in ('aguardando_conferencia', 'enviada') or "pedidos_agenda_ocorrencias"."solicitacao_id" is not null),
	CONSTRAINT "pedidos_agenda_ocorrencias_envio_check" CHECK (("pedidos_agenda_ocorrencias"."situacao" = 'enviada') = ("pedidos_agenda_ocorrencias"."enviada_em" is not null and "pedidos_agenda_ocorrencias"."enviada_por" is not null)),
	CONSTRAINT "pedidos_agenda_ocorrencias_cancelamento_check" CHECK (("pedidos_agenda_ocorrencias"."situacao" = 'cancelada') = ("pedidos_agenda_ocorrencias"."cancelada_em" is not null and "pedidos_agenda_ocorrencias"."cancelada_por" is not null))
);
--> statement-breakpoint
CREATE TABLE "pedidos_agendas" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"grupo_mercadoria_id" uuid NOT NULL,
	"responsavel_id" text NOT NULL,
	"inicio_em" timestamp with time zone NOT NULL,
	"fuso_horario" text NOT NULL,
	"regra" jsonb NOT NULL,
	"termino_tipo" text DEFAULT 'nunca' NOT NULL,
	"termino_em" date,
	"termino_quantidade" integer,
	"prazo_resposta_horas" integer NOT NULL,
	"status" text DEFAULT 'ativa' NOT NULL,
	"serie_anterior_id" uuid,
	"encerrada_em" timestamp with time zone,
	"criado_por" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pedidos_agendas_id_empresa_unica" UNIQUE("id","empresa_id"),
	CONSTRAINT "pedidos_agendas_status_check" CHECK ("pedidos_agendas"."status" in ('ativa', 'encerrada')),
	CONSTRAINT "pedidos_agendas_encerramento_check" CHECK (("pedidos_agendas"."status" = 'encerrada') = ("pedidos_agendas"."encerrada_em" is not null)),
	CONSTRAINT "pedidos_agendas_prazo_check" CHECK ("pedidos_agendas"."prazo_resposta_horas" between 1 and 720),
	CONSTRAINT "pedidos_agendas_fuso_check" CHECK (btrim("pedidos_agendas"."fuso_horario") <> ''),
	CONSTRAINT "pedidos_agendas_termino_check" CHECK (("pedidos_agendas"."termino_tipo" = 'nunca' and "pedidos_agendas"."termino_em" is null and "pedidos_agendas"."termino_quantidade" is null) or ("pedidos_agendas"."termino_tipo" = 'data' and "pedidos_agendas"."termino_em" is not null and "pedidos_agendas"."termino_quantidade" is null) or ("pedidos_agendas"."termino_tipo" = 'quantidade' and "pedidos_agendas"."termino_quantidade" between 1 and 999 and "pedidos_agendas"."termino_em" is null))
);
--> statement-breakpoint
CREATE TABLE "pedidos_agendas_produtos" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"agenda_id" uuid NOT NULL,
	"produto_id" uuid NOT NULL,
	"quantidade_padrao" numeric(14, 3),
	CONSTRAINT "pedidos_agendas_produtos_unico" UNIQUE("agenda_id","produto_id"),
	CONSTRAINT "pedidos_agendas_produtos_quantidade_check" CHECK ("pedidos_agendas_produtos"."quantidade_padrao" is null or "pedidos_agendas_produtos"."quantidade_padrao" > 0)
);
--> statement-breakpoint
ALTER TABLE "compras_solicitacoes" DROP CONSTRAINT "compras_solicitacoes_origem_check";--> statement-breakpoint
ALTER TABLE "notificacoes" DROP CONSTRAINT "notificacoes_tipo_check";--> statement-breakpoint
ALTER TABLE "pedidos_agenda_ocorrencias" ADD CONSTRAINT "pedidos_agenda_ocorrencias_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_agenda_ocorrencias" ADD CONSTRAINT "pedidos_agenda_ocorrencias_solicitacao_id_compras_solicitacoes_id_fk" FOREIGN KEY ("solicitacao_id") REFERENCES "public"."compras_solicitacoes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_agenda_ocorrencias" ADD CONSTRAINT "pedidos_agenda_ocorrencias_enviada_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("enviada_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_agenda_ocorrencias" ADD CONSTRAINT "pedidos_agenda_ocorrencias_cancelada_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("cancelada_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_agenda_ocorrencias" ADD CONSTRAINT "pedidos_agenda_ocorrencias_agenda_empresa_fk" FOREIGN KEY ("agenda_id","empresa_id") REFERENCES "public"."pedidos_agendas"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_agendas" ADD CONSTRAINT "pedidos_agendas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_agendas" ADD CONSTRAINT "pedidos_agendas_responsavel_id_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_agendas" ADD CONSTRAINT "pedidos_agendas_serie_anterior_id_pedidos_agendas_id_fk" FOREIGN KEY ("serie_anterior_id") REFERENCES "public"."pedidos_agendas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_agendas" ADD CONSTRAINT "pedidos_agendas_criado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_agendas" ADD CONSTRAINT "pedidos_agendas_grupo_empresa_fk" FOREIGN KEY ("grupo_mercadoria_id","empresa_id") REFERENCES "public"."grupos_mercadorias"("id","empresa_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_agendas_produtos" ADD CONSTRAINT "pedidos_agendas_produtos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_agendas_produtos" ADD CONSTRAINT "pedidos_agendas_produtos_agenda_empresa_fk" FOREIGN KEY ("agenda_id","empresa_id") REFERENCES "public"."pedidos_agendas"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_agendas_produtos" ADD CONSTRAINT "pedidos_agendas_produtos_produto_empresa_fk" FOREIGN KEY ("produto_id","empresa_id") REFERENCES "public"."produtos"("id","empresa_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pedidos_agenda_ocorrencias_empresa_situacao_idx" ON "pedidos_agenda_ocorrencias" USING btree ("empresa_id","situacao","data_atual");--> statement-breakpoint
CREATE INDEX "pedidos_agendas_empresa_status_idx" ON "pedidos_agendas" USING btree ("empresa_id","status");--> statement-breakpoint
ALTER TABLE "compras_solicitacoes" ADD CONSTRAINT "compras_solicitacoes_origem_check" CHECK ("compras_solicitacoes"."origem" in ('manual', 'sugestao', 'rapida', 'agendamento'));--> statement-breakpoint
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_tipo_check" CHECK ("notificacoes"."tipo" in ('quebra_caixa', 'transferencia_divergencia', 'transferencia_prazo_confirmacao',
        'mensagem_admin', 'campanha', 'lancamento_vencimento', 'compras_decisao_pendente', 'compras_agendamento_conferir'));
--> statement-breakpoint
CREATE TRIGGER "pedidos_agendas_set_atualizado_em"
BEFORE UPDATE ON "pedidos_agendas"
FOR EACH ROW
EXECUTE FUNCTION set_atualizado_em();
--> statement-breakpoint
CREATE TRIGGER "pedidos_agenda_ocorrencias_set_atualizado_em"
BEFORE UPDATE ON "pedidos_agenda_ocorrencias"
FOR EACH ROW
EXECUTE FUNCTION set_atualizado_em();