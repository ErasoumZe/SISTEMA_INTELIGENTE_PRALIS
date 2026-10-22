CREATE TABLE "compras_whatsapp_envios" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"convite_id" uuid,
	"pedido_id" uuid,
	"telefone" text NOT NULL,
	"status" text DEFAULT 'pendente' NOT NULL,
	"tentativas" integer DEFAULT 0 NOT NULL,
	"ultimo_erro" text,
	"mensagem_externa_id" text,
	"enviado_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "compras_whatsapp_envios_tipo_check" CHECK ("compras_whatsapp_envios"."tipo" in ('convite', 'pedido_confirmado')),
	CONSTRAINT "compras_whatsapp_envios_status_check" CHECK ("compras_whatsapp_envios"."status" in ('pendente', 'enviado', 'falhou')),
	CONSTRAINT "compras_whatsapp_envios_referencia_check" CHECK (("compras_whatsapp_envios"."tipo" = 'convite' and "compras_whatsapp_envios"."convite_id" is not null) or ("compras_whatsapp_envios"."tipo" = 'pedido_confirmado' and "compras_whatsapp_envios"."pedido_id" is not null)),
	CONSTRAINT "compras_whatsapp_envios_tentativas_check" CHECK ("compras_whatsapp_envios"."tentativas" >= 0)
);
--> statement-breakpoint
CREATE TABLE "conferencias_agendas" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"responsavel_id" text NOT NULL,
	"grupo_mercadoria_id" uuid,
	"ranking" text,
	"area_estoque" text,
	"local_estoque" text,
	"local_venda" text,
	"inicio_em" timestamp with time zone NOT NULL,
	"fuso_horario" text NOT NULL,
	"regra" jsonb NOT NULL,
	"termino_tipo" text DEFAULT 'nunca' NOT NULL,
	"termino_em" date,
	"termino_quantidade" integer,
	"observacao" text,
	"status" text DEFAULT 'ativa' NOT NULL,
	"encerrada_em" timestamp with time zone,
	"criado_por" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conferencias_agendas_ranking_check" CHECK ("conferencias_agendas"."ranking" is null or "conferencias_agendas"."ranking" in ('mais_vendidos', 'mais_comprados', 'mais_lucro')),
	CONSTRAINT "conferencias_agendas_status_check" CHECK ("conferencias_agendas"."status" in ('ativa', 'encerrada')),
	CONSTRAINT "conferencias_agendas_encerramento_check" CHECK (("conferencias_agendas"."status" = 'encerrada') = ("conferencias_agendas"."encerrada_em" is not null)),
	CONSTRAINT "conferencias_agendas_fuso_check" CHECK (btrim("conferencias_agendas"."fuso_horario") <> ''),
	CONSTRAINT "conferencias_agendas_termino_check" CHECK (("conferencias_agendas"."termino_tipo" = 'nunca' and "conferencias_agendas"."termino_em" is null and "conferencias_agendas"."termino_quantidade" is null) or ("conferencias_agendas"."termino_tipo" = 'data' and "conferencias_agendas"."termino_em" is not null and "conferencias_agendas"."termino_quantidade" is null) or ("conferencias_agendas"."termino_tipo" = 'quantidade' and "conferencias_agendas"."termino_quantidade" between 1 and 999 and "conferencias_agendas"."termino_em" is null))
);
--> statement-breakpoint
CREATE TABLE "conferencias_estoque_itens" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"conferencia_id" uuid NOT NULL,
	"produto_id" uuid NOT NULL,
	"saldo_sistema" numeric(14, 3) NOT NULL,
	"quantidade_contada" numeric(14, 3),
	"contado_por" text,
	"contado_em" timestamp with time zone,
	CONSTRAINT "conferencias_estoque_itens_unico" UNIQUE("conferencia_id","produto_id"),
	CONSTRAINT "conferencias_estoque_itens_contagem_check" CHECK ("conferencias_estoque_itens"."quantidade_contada" is null or "conferencias_estoque_itens"."quantidade_contada" >= 0),
	CONSTRAINT "conferencias_estoque_itens_autoria_check" CHECK (("conferencias_estoque_itens"."quantidade_contada" is null) = ("conferencias_estoque_itens"."contado_por" is null and "conferencias_estoque_itens"."contado_em" is null))
);
--> statement-breakpoint
ALTER TABLE "notificacoes" DROP CONSTRAINT "notificacoes_tipo_check";--> statement-breakpoint
ALTER TABLE "pedidos" DROP CONSTRAINT "pedidos_status_check";--> statement-breakpoint
ALTER TABLE "pedidos_eventos" DROP CONSTRAINT "pedidos_eventos_status_check";--> statement-breakpoint
ALTER TABLE "compras_propostas_itens" ADD COLUMN "quantidade_disponivel" numeric(14, 3);--> statement-breakpoint
ALTER TABLE "compras_propostas_itens" ADD COLUMN "motivo_indisponivel" text;--> statement-breakpoint
ALTER TABLE "compras_rodadas" ADD COLUMN "margem_variacao_percentual" smallint;--> statement-breakpoint
ALTER TABLE "conferencias_estoque" ADD COLUMN "agenda_id" uuid;--> statement-breakpoint
ALTER TABLE "conferencias_estoque" ADD COLUMN "previsto_para" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "conferencias_estoque" ADD COLUMN "responsavel_id" text;--> statement-breakpoint
ALTER TABLE "conferencias_estoque" ADD COLUMN "ranking" text;--> statement-breakpoint
ALTER TABLE "conferencias_estoque" ADD COLUMN "concluida_por" text;--> statement-breakpoint
ALTER TABLE "conferencias_estoque" ADD COLUMN "concluida_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pedidos_agendas" ADD COLUMN "margem_variacao_percentual" smallint DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "compras_whatsapp_envios" ADD CONSTRAINT "compras_whatsapp_envios_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_whatsapp_envios" ADD CONSTRAINT "compras_whatsapp_envios_convite_id_compras_rodadas_convites_id_fk" FOREIGN KEY ("convite_id") REFERENCES "public"."compras_rodadas_convites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_whatsapp_envios" ADD CONSTRAINT "compras_whatsapp_envios_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conferencias_agendas" ADD CONSTRAINT "conferencias_agendas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conferencias_agendas" ADD CONSTRAINT "conferencias_agendas_responsavel_id_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conferencias_agendas" ADD CONSTRAINT "conferencias_agendas_grupo_mercadoria_id_grupos_mercadorias_id_fk" FOREIGN KEY ("grupo_mercadoria_id") REFERENCES "public"."grupos_mercadorias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conferencias_agendas" ADD CONSTRAINT "conferencias_agendas_criado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conferencias_estoque_itens" ADD CONSTRAINT "conferencias_estoque_itens_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conferencias_estoque_itens" ADD CONSTRAINT "conferencias_estoque_itens_conferencia_id_conferencias_estoque_id_fk" FOREIGN KEY ("conferencia_id") REFERENCES "public"."conferencias_estoque"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conferencias_estoque_itens" ADD CONSTRAINT "conferencias_estoque_itens_contado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("contado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conferencias_estoque_itens" ADD CONSTRAINT "conferencias_estoque_itens_produto_empresa_fk" FOREIGN KEY ("produto_id","empresa_id") REFERENCES "public"."produtos"("id","empresa_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "compras_whatsapp_envios_status_idx" ON "compras_whatsapp_envios" USING btree ("status","criado_em");--> statement-breakpoint
CREATE INDEX "compras_whatsapp_envios_convite_idx" ON "compras_whatsapp_envios" USING btree ("convite_id");--> statement-breakpoint
CREATE INDEX "conferencias_agendas_empresa_status_idx" ON "conferencias_agendas" USING btree ("empresa_id","status");--> statement-breakpoint
ALTER TABLE "conferencias_estoque" ADD CONSTRAINT "conferencias_estoque_agenda_id_conferencias_agendas_id_fk" FOREIGN KEY ("agenda_id") REFERENCES "public"."conferencias_agendas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conferencias_estoque" ADD CONSTRAINT "conferencias_estoque_responsavel_id_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conferencias_estoque" ADD CONSTRAINT "conferencias_estoque_concluida_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("concluida_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conferencias_estoque" ADD CONSTRAINT "conferencias_estoque_agenda_data_unica" UNIQUE("agenda_id","previsto_para");--> statement-breakpoint
ALTER TABLE "compras_propostas_itens" ADD CONSTRAINT "compras_propostas_itens_quantidade_disponivel_check" CHECK ("compras_propostas_itens"."quantidade_disponivel" is null or "compras_propostas_itens"."quantidade_disponivel" > 0);--> statement-breakpoint
ALTER TABLE "compras_propostas_itens" ADD CONSTRAINT "compras_propostas_itens_motivo_check" CHECK ("compras_propostas_itens"."motivo_indisponivel" is null or ("compras_propostas_itens"."indisponivel" and "compras_propostas_itens"."motivo_indisponivel" in ('sem_estoque', 'nao_trabalha')));--> statement-breakpoint
ALTER TABLE "compras_rodadas" ADD CONSTRAINT "compras_rodadas_margem_check" CHECK ("compras_rodadas"."margem_variacao_percentual" is null or "compras_rodadas"."margem_variacao_percentual" in (10, 20, 30, 40));--> statement-breakpoint
ALTER TABLE "conferencias_estoque" ADD CONSTRAINT "conferencias_estoque_ranking_check" CHECK ("conferencias_estoque"."ranking" is null or "conferencias_estoque"."ranking" in ('mais_vendidos', 'mais_comprados', 'mais_lucro'));--> statement-breakpoint
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_tipo_check" CHECK ("notificacoes"."tipo" in ('quebra_caixa', 'transferencia_divergencia', 'transferencia_prazo_confirmacao',
        'mensagem_admin', 'campanha', 'lancamento_vencimento', 'compras_decisao_pendente', 'compras_agendamento_conferir', 'conferencia_estoque_fazer'));--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_status_check" CHECK ("pedidos"."status" in ('rascunho', 'aprovado', 'a_fazer', 'enviado', 'cotado', 'retornado', 'confirmado', 'recebido_parcial', 'recebido', 'cancelado'));--> statement-breakpoint
ALTER TABLE "pedidos_agendas" ADD CONSTRAINT "pedidos_agendas_margem_check" CHECK ("pedidos_agendas"."margem_variacao_percentual" in (10, 20, 30, 40));--> statement-breakpoint
ALTER TABLE "pedidos_eventos" ADD CONSTRAINT "pedidos_eventos_status_check" CHECK ("pedidos_eventos"."status" in ('a_fazer', 'enviado', 'cotado', 'retornado', 'confirmado', 'recebido_parcial', 'recebido', 'cancelado'));
--> statement-breakpoint
CREATE TRIGGER "compras_whatsapp_envios_set_atualizado_em"
BEFORE UPDATE ON "compras_whatsapp_envios"
FOR EACH ROW
EXECUTE FUNCTION set_atualizado_em();
--> statement-breakpoint
CREATE TRIGGER "conferencias_agendas_set_atualizado_em"
BEFORE UPDATE ON "conferencias_agendas"
FOR EACH ROW
EXECUTE FUNCTION set_atualizado_em();
--> statement-breakpoint
CREATE TRIGGER "conferencias_estoque_set_atualizado_em"
BEFORE UPDATE ON "conferencias_estoque"
FOR EACH ROW
EXECUTE FUNCTION set_atualizado_em();