-- ORDEM CORRIGIDA A MAO, pelo mesmo motivo da 0033: o `drizzle-kit generate` emitiu a FK composta
-- `quebras_caixa_transferencia_fk` ANTES do UNIQUE de `transferencias` que ela referencia, e a
-- migration nao aplicava:
--
--     ERROR: there is no unique constraint matching given keys for referenced table "transferencias"
--
-- Uma FK composta exige que a tripla (id, caixa_id, empresa_id) ja seja UNIQUE no alvo. Por isso o
-- UNIQUE vem antes da FK aqui. Nada mais foi tocado: mesmas instrucoes, mesmo estado final, mesmo
-- snapshot — e por isso o gate `Deve_GerarEstruturaIdenticaAoPush_...` continua verde.
--
-- Se um dia alguem regenerar esta migration do zero, o gerador vai errar a ordem de novo.
--
-- NOTA DE APLICACAO: este arquivo depende da transacao do `drizzle-kit migrate`. O unique antigo de
-- `quebras_caixa` cai antes de os indices parciais que o substituem existirem — colar statement a
-- statement no psql deixaria a tabela sem unicidade nenhuma no meio do caminho.
ALTER TABLE "transferencias" ADD COLUMN "valor_recebido" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_id_caixa_empresa_unica" UNIQUE("id","caixa_id","empresa_id");--> statement-breakpoint
ALTER TABLE "quebras_caixa" ADD COLUMN "transferencia_id" uuid;--> statement-breakpoint
ALTER TABLE "quebras_caixa" DROP CONSTRAINT "quebras_caixa_fechamento_unico";--> statement-breakpoint
ALTER TABLE "quebras_caixa" ADD CONSTRAINT "quebras_caixa_transferencia_fk" FOREIGN KEY ("transferencia_id","fechamento_caixa_id","empresa_id") REFERENCES "public"."transferencias"("id","caixa_id","empresa_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "quebras_caixa_contagem_unica" ON "quebras_caixa" USING btree ("fechamento_caixa_id") WHERE "quebras_caixa"."transferencia_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "quebras_caixa_transferencia_unica" ON "quebras_caixa" USING btree ("transferencia_id") WHERE "quebras_caixa"."transferencia_id" is not null;--> statement-breakpoint
CREATE INDEX "quebras_caixa_fechamento_idx" ON "quebras_caixa" USING btree ("fechamento_caixa_id");--> statement-breakpoint
ALTER TABLE "quebras_caixa" ADD CONSTRAINT "quebras_caixa_divergencia_negativa_check" CHECK ("quebras_caixa"."transferencia_id" is null or "quebras_caixa"."valor" < 0);--> statement-breakpoint
ALTER TABLE "transferencias" DROP CONSTRAINT "transferencias_status_check";--> statement-breakpoint
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_status_check" CHECK ("transferencias"."status" in ('pendente', 'recebido', 'agendada', 'cancelada', 'divergente'));--> statement-breakpoint
ALTER TABLE "transferencias" DROP CONSTRAINT "transferencias_solicitacao_cofre_check";--> statement-breakpoint
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_solicitacao_cofre_check" CHECK (("transferencias"."solicitacao_cofre_em" is null
             and "transferencias"."executado_por" is null
             and "transferencias"."executado_em" is null)
        or ("transferencias"."solicitacao_cofre_em" is not null
             and "transferencias"."caixa_id" is not null
             and "transferencias"."tipo" in ('sangria', 'retorno')
             and (("transferencias"."status" in ('agendada', 'cancelada')
                     and "transferencias"."executado_por" is null
                     and "transferencias"."executado_em" is null)
               or ("transferencias"."status" in ('pendente', 'recebido', 'divergente')
                     and "transferencias"."executado_por" is not null
                     and "transferencias"."executado_em" is not null))));--> statement-breakpoint
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_valor_recebido_check" CHECK (("transferencias"."status" = 'divergente'
             and "transferencias"."valor_recebido" is not null
             and "transferencias"."valor_recebido" >= 0)
        or ("transferencias"."status" <> 'divergente' and "transferencias"."valor_recebido" is null));--> statement-breakpoint
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_divergente_escopo_check" CHECK ("transferencias"."status" <> 'divergente'
        or ("transferencias"."caixa_id" is not null and "transferencias"."tipo" in ('sangria', 'retorno')));
