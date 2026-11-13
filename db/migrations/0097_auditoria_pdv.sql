CREATE TABLE "auditorias_pdv" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"data" date NOT NULL,
	"gerada_por" text,
	"gerada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"vendas_fora" integer NOT NULL,
	"valor_fora" numeric(14, 2) NOT NULL,
	"resultado" jsonb NOT NULL,
	CONSTRAINT "auditorias_pdv_empresa_data_unica" UNIQUE("empresa_id","data"),
	CONSTRAINT "auditorias_pdv_vendas_fora_check" CHECK ("auditorias_pdv"."vendas_fora" >= 0)
);
--> statement-breakpoint
CREATE TABLE "auditorias_pdv_agenda" (
	"empresa_id" uuid PRIMARY KEY NOT NULL,
	"ativa" boolean DEFAULT false NOT NULL,
	"horario" text DEFAULT '23:30' NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auditorias_pdv_agenda_horario_check" CHECK ("auditorias_pdv_agenda"."horario" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);
--> statement-breakpoint
ALTER TABLE "notificacoes" DROP CONSTRAINT "notificacoes_tipo_check";--> statement-breakpoint
ALTER TABLE "auditorias_pdv" ADD CONSTRAINT "auditorias_pdv_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditorias_pdv" ADD CONSTRAINT "auditorias_pdv_gerada_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("gerada_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditorias_pdv_agenda" ADD CONSTRAINT "auditorias_pdv_agenda_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_tipo_check" CHECK ("notificacoes"."tipo" in ('quebra_caixa', 'transferencia_divergencia', 'transferencia_prazo_confirmacao',
        'mensagem_admin', 'campanha', 'lancamento_vencimento', 'compras_decisao_pendente', 'compras_agendamento_conferir', 'conferencia_estoque_fazer',
        'sangria_recusada', 'auditoria_pdv'));