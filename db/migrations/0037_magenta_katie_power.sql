CREATE TABLE "mensagens_admin" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"titulo" text NOT NULL,
	"corpo" text NOT NULL,
	"valido_ate" timestamp with time zone,
	"status" text DEFAULT 'ativa' NOT NULL,
	"criado_por" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mensagens_admin_id_empresa_unica" UNIQUE("id","empresa_id"),
	CONSTRAINT "mensagens_admin_status_check" CHECK ("mensagens_admin"."status" in ('ativa', 'encerrada')),
	CONSTRAINT "mensagens_admin_titulo_nao_vazio_check" CHECK (length(btrim("mensagens_admin"."titulo")) > 0),
	CONSTRAINT "mensagens_admin_corpo_nao_vazio_check" CHECK (length(btrim("mensagens_admin"."corpo")) > 0)
);
--> statement-breakpoint
CREATE TABLE "mensagens_admin_alvos" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"mensagem_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"pdv_id" uuid,
	"usuario_id" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mensagens_admin_alvos_tipo_check" CHECK ("mensagens_admin_alvos"."tipo" in ('caixas_abertos', 'empresa', 'pdv', 'operador')),
	CONSTRAINT "mensagens_admin_alvos_coerencia_check" CHECK (("mensagens_admin_alvos"."tipo" in ('caixas_abertos', 'empresa') and "mensagens_admin_alvos"."pdv_id" is null and "mensagens_admin_alvos"."usuario_id" is null)
        or ("mensagens_admin_alvos"."tipo" = 'pdv' and "mensagens_admin_alvos"."pdv_id" is not null and "mensagens_admin_alvos"."usuario_id" is null)
        or ("mensagens_admin_alvos"."tipo" = 'operador' and "mensagens_admin_alvos"."usuario_id" is not null and "mensagens_admin_alvos"."pdv_id" is null))
);
--> statement-breakpoint
CREATE TABLE "mensagens_admin_entregas" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"mensagem_id" uuid NOT NULL,
	"destinatario_usuario_id" text NOT NULL,
	"pdv_id" uuid,
	"fechamento_caixa_id" uuid,
	"entregue_em" timestamp with time zone,
	"visualizada_em" timestamp with time zone,
	"confirmada_em" timestamp with time zone,
	"fechada_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mensagens_admin_entregas_ordem_check" CHECK (("mensagens_admin_entregas"."visualizada_em" is null or "mensagens_admin_entregas"."entregue_em" is not null)
        and ("mensagens_admin_entregas"."confirmada_em" is null or "mensagens_admin_entregas"."visualizada_em" is not null)
        and ("mensagens_admin_entregas"."fechada_em" is null or "mensagens_admin_entregas"."entregue_em" is not null))
);
--> statement-breakpoint
ALTER TABLE "notificacoes" DROP CONSTRAINT "notificacoes_tipo_check";--> statement-breakpoint
ALTER TABLE "mensagens_admin" ADD CONSTRAINT "mensagens_admin_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens_admin" ADD CONSTRAINT "mensagens_admin_criado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens_admin_alvos" ADD CONSTRAINT "mensagens_admin_alvos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens_admin_alvos" ADD CONSTRAINT "mensagens_admin_alvos_usuario_id_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens_admin_alvos" ADD CONSTRAINT "mensagens_admin_alvos_mensagem_empresa_fk" FOREIGN KEY ("mensagem_id","empresa_id") REFERENCES "public"."mensagens_admin"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pdvs" ADD CONSTRAINT "pdvs_id_empresa_unica" UNIQUE("id","empresa_id");
--> statement-breakpoint
ALTER TABLE "mensagens_admin_alvos" ADD CONSTRAINT "mensagens_admin_alvos_pdv_empresa_fk" FOREIGN KEY ("pdv_id","empresa_id") REFERENCES "public"."pdvs"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens_admin_entregas" ADD CONSTRAINT "mensagens_admin_entregas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens_admin_entregas" ADD CONSTRAINT "mensagens_admin_entregas_destinatario_usuario_id_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("destinatario_usuario_id") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens_admin_entregas" ADD CONSTRAINT "mensagens_admin_entregas_mensagem_empresa_fk" FOREIGN KEY ("mensagem_id","empresa_id") REFERENCES "public"."mensagens_admin"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens_admin_entregas" ADD CONSTRAINT "mensagens_admin_entregas_pdv_empresa_fk" FOREIGN KEY ("pdv_id","empresa_id") REFERENCES "public"."pdvs"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens_admin_entregas" ADD CONSTRAINT "mensagens_admin_entregas_caixa_empresa_fk" FOREIGN KEY ("fechamento_caixa_id","empresa_id") REFERENCES "public"."fechamentos_caixa"("id","empresa_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mensagens_admin_empresa_status_idx" ON "mensagens_admin" USING btree ("empresa_id","status","valido_ate");--> statement-breakpoint
CREATE UNIQUE INDEX "mensagens_admin_alvos_pdv_unico_idx" ON "mensagens_admin_alvos" USING btree ("mensagem_id","pdv_id") WHERE "mensagens_admin_alvos"."pdv_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "mensagens_admin_alvos_usuario_unico_idx" ON "mensagens_admin_alvos" USING btree ("mensagem_id","usuario_id") WHERE "mensagens_admin_alvos"."usuario_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "mensagens_admin_alvos_amplo_unico_idx" ON "mensagens_admin_alvos" USING btree ("mensagem_id","tipo") WHERE "mensagens_admin_alvos"."tipo" in ('caixas_abertos', 'empresa');--> statement-breakpoint
CREATE UNIQUE INDEX "mensagens_admin_entregas_por_pdv_idx" ON "mensagens_admin_entregas" USING btree ("mensagem_id","destinatario_usuario_id","pdv_id") WHERE "mensagens_admin_entregas"."pdv_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "mensagens_admin_entregas_sem_pdv_idx" ON "mensagens_admin_entregas" USING btree ("mensagem_id","destinatario_usuario_id") WHERE "mensagens_admin_entregas"."pdv_id" is null;--> statement-breakpoint
CREATE INDEX "mensagens_admin_entregas_painel_idx" ON "mensagens_admin_entregas" USING btree ("empresa_id","mensagem_id","confirmada_em");--> statement-breakpoint
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_tipo_check" CHECK ("notificacoes"."tipo" in ('quebra_caixa', 'transferencia_divergencia', 'transferencia_prazo_confirmacao',
        'mensagem_admin', 'campanha'));