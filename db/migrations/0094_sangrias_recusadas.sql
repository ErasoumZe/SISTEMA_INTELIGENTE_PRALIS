CREATE TABLE "sangrias_recusadas" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"fechamento_caixa_id" uuid NOT NULL,
	"usuario_id" text NOT NULL,
	"valor" numeric(14, 2) NOT NULL,
	"motivo" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sangrias_recusadas_motivo_check" CHECK ("sangrias_recusadas"."motivo" in ('acima_do_disponivel', 'sem_saldo', 'reservado_para_retornos')),
	CONSTRAINT "sangrias_recusadas_valor_positivo_check" CHECK ("sangrias_recusadas"."valor" > 0)
);
--> statement-breakpoint
ALTER TABLE "notificacoes" DROP CONSTRAINT "notificacoes_tipo_check";--> statement-breakpoint
ALTER TABLE "sangrias_recusadas" ADD CONSTRAINT "sangrias_recusadas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sangrias_recusadas" ADD CONSTRAINT "sangrias_recusadas_fechamento_caixa_id_fechamentos_caixa_id_fk" FOREIGN KEY ("fechamento_caixa_id") REFERENCES "public"."fechamentos_caixa"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sangrias_recusadas" ADD CONSTRAINT "sangrias_recusadas_usuario_id_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sangrias_recusadas_caixa_idx" ON "sangrias_recusadas" USING btree ("fechamento_caixa_id");--> statement-breakpoint
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_tipo_check" CHECK ("notificacoes"."tipo" in ('quebra_caixa', 'transferencia_divergencia', 'transferencia_prazo_confirmacao',
        'mensagem_admin', 'campanha', 'lancamento_vencimento', 'compras_decisao_pendente', 'compras_agendamento_conferir', 'conferencia_estoque_fazer',
        'sangria_recusada'));