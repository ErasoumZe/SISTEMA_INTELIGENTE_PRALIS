ALTER TABLE "transferencias" DROP CONSTRAINT "transferencias_solicitacao_cofre_check";--> statement-breakpoint
ALTER TABLE "transferencias" ADD COLUMN "planejamento_origem_transferencia_id" uuid;--> statement-breakpoint
CREATE INDEX "transferencias_planejamento_origem_idx" ON "transferencias" USING btree ("planejamento_origem_transferencia_id") WHERE "transferencias"."planejamento_origem_transferencia_id" is not null;--> statement-breakpoint
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_id_empresa_unica" UNIQUE("id","empresa_id");--> statement-breakpoint
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_planejamento_origem_empresa_fk" FOREIGN KEY ("planejamento_origem_transferencia_id","empresa_id") REFERENCES "public"."transferencias"("id","empresa_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_planejamento_lacre_check" CHECK ("transferencias"."planejamento_origem_transferencia_id" is null
        or ("transferencias"."n_lacre_doc" is not null and length(btrim("transferencias"."n_lacre_doc")) > 0));--> statement-breakpoint
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_planejamento_nao_autorreferente_check" CHECK ("transferencias"."planejamento_origem_transferencia_id" is null
        or "transferencias"."planejamento_origem_transferencia_id" <> "transferencias"."id");--> statement-breakpoint
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_solicitacao_cofre_check" CHECK (("transferencias"."agendada_para" is null or "transferencias"."planejamento_origem_transferencia_id" is null)
        and (("transferencias"."solicitacao_cofre_em" is null
             and "transferencias"."executado_por" is null
             and "transferencias"."executado_em" is null
             and "transferencias"."planejamento_origem_transferencia_id" is null)
        or ("transferencias"."solicitacao_cofre_em" is not null
             and ("transferencias"."caixa_id" is not null or ("transferencias"."status" in ('agendada', 'cancelada') and "transferencias"."planejamento_origem_transferencia_id" is not null))
             and "transferencias"."tipo" in ('sangria', 'retorno')
             and (("transferencias"."status" in ('agendada', 'cancelada')
                     and "transferencias"."executado_por" is null
                     and "transferencias"."executado_em" is null)
               or ("transferencias"."status" in ('pendente', 'recebido', 'divergente')
                     and "transferencias"."executado_por" is not null
                     and "transferencias"."executado_em" is not null))));
