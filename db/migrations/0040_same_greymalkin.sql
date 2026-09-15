ALTER TABLE "notificacoes" DROP CONSTRAINT "notificacoes_tipo_check";--> statement-breakpoint
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_tipo_check" CHECK ("notificacoes"."tipo" in ('quebra_caixa', 'transferencia_divergencia', 'transferencia_prazo_confirmacao',
        'mensagem_admin', 'campanha', 'lancamento_vencimento'));