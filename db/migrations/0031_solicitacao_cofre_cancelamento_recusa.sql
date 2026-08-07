CREATE TABLE "transferencias_conferencias_recusadas" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"transferencia_id" uuid NOT NULL,
	"recusado_por" text NOT NULL,
	"motivo" text NOT NULL,
	"lacre_informado" text,
	"valor_informado" numeric(14, 2),
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transferencias_conferencias_recusadas_motivo_check" CHECK (length(btrim("transferencias_conferencias_recusadas"."motivo")) > 0),
	CONSTRAINT "transferencias_conferencias_recusadas_valor_check" CHECK ("transferencias_conferencias_recusadas"."valor_informado" is null or "transferencias_conferencias_recusadas"."valor_informado" >= 0)
);
--> statement-breakpoint
ALTER TABLE "transferencias" ADD COLUMN "solicitacao_cofre_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "transferencias" ADD COLUMN "executado_por" text;--> statement-breakpoint
ALTER TABLE "transferencias" ADD COLUMN "executado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "transferencias" ADD COLUMN "cancelado_por" text;--> statement-breakpoint
ALTER TABLE "transferencias" ADD COLUMN "cancelado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "transferencias" ADD COLUMN "motivo_cancelamento" text;--> statement-breakpoint
ALTER TABLE "transferencias_conferencias_recusadas" ADD CONSTRAINT "transferencias_conferencias_recusadas_transferencia_id_transferencias_id_fk" FOREIGN KEY ("transferencia_id") REFERENCES "public"."transferencias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferencias_conferencias_recusadas" ADD CONSTRAINT "transferencias_conferencias_recusadas_recusado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("recusado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transferencias_conferencias_recusadas_transferencia_idx" ON "transferencias_conferencias_recusadas" USING btree ("transferencia_id","criado_em");--> statement-breakpoint
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_executado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("executado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_cancelado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("cancelado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transferencias_solicitacao_cofre_idx" ON "transferencias" USING btree ("caixa_id","status") WHERE "transferencias"."solicitacao_cofre_em" is not null;--> statement-breakpoint
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_cancelamento_check" CHECK (("transferencias"."status" = 'cancelada'
             and "transferencias"."cancelado_por" is not null
             and "transferencias"."cancelado_em" is not null
             and "transferencias"."motivo_cancelamento" is not null
             and length(btrim("transferencias"."motivo_cancelamento")) > 0)
        or ("transferencias"."status" <> 'cancelada'
             and "transferencias"."cancelado_por" is null
             and "transferencias"."cancelado_em" is null
             and "transferencias"."motivo_cancelamento" is null));--> statement-breakpoint
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_solicitacao_cofre_check" CHECK (("transferencias"."solicitacao_cofre_em" is null
             and "transferencias"."executado_por" is null
             and "transferencias"."executado_em" is null)
        or ("transferencias"."solicitacao_cofre_em" is not null
             and "transferencias"."caixa_id" is not null
             and "transferencias"."tipo" in ('sangria', 'retorno')
             and (("transferencias"."status" in ('agendada', 'cancelada')
                     and "transferencias"."executado_por" is null
                     and "transferencias"."executado_em" is null)
               or ("transferencias"."status" in ('pendente', 'recebido')
                     and "transferencias"."executado_por" is not null
                     and "transferencias"."executado_em" is not null))));