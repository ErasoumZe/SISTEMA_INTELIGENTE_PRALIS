-- ORDEM CORRIGIDA A MAO, e o motivo importa: o `drizzle-kit generate` emitiu o UNIQUE de `contas`
-- DEPOIS das FKs compostas de `formas_pagamento` que o referenciam, e a migration nao aplicava:
--
--     ERROR: there is no unique constraint matching given keys for referenced table "contas"
--
-- Uma FK composta exige que o par (id, empresa_id) ja seja UNIQUE no alvo. Por isso este statement
-- vem PRIMEIRO. Nada mais foi tocado: mesmas instrucoes, mesmo estado final, mesmo snapshot.
--
-- Se um dia alguem regenerar esta migration do zero, o gerador vai errar a ordem de novo.
ALTER TABLE "contas" ADD CONSTRAINT "contas_id_empresa_unica" UNIQUE("id","empresa_id");--> statement-breakpoint
ALTER TABLE "formas_pagamento" ADD COLUMN "adquirente" text;--> statement-breakpoint
ALTER TABLE "formas_pagamento" ADD COLUMN "usa_conta_do_pdv" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "formas_pagamento" ADD COLUMN "conta_recebivel_id" uuid;--> statement-breakpoint
ALTER TABLE "formas_pagamento" ADD COLUMN "conta_final_id" uuid;--> statement-breakpoint
ALTER TABLE "formas_pagamento" ADD COLUMN "disponibilidade" text;--> statement-breakpoint
ALTER TABLE "formas_pagamento" ADD COLUMN "atualizado_por" text;--> statement-breakpoint
ALTER TABLE "vendas_pagamentos" ADD COLUMN "roteamento_status" text DEFAULT 'nao_aplicavel' NOT NULL;--> statement-breakpoint
ALTER TABLE "vendas_pagamentos" ADD COLUMN "conta_recebivel_id" uuid;--> statement-breakpoint
ALTER TABLE "vendas_pagamentos" ADD COLUMN "conta_final_id" uuid;--> statement-breakpoint
ALTER TABLE "vendas_pagamentos" ADD COLUMN "adquirente" text;--> statement-breakpoint
ALTER TABLE "vendas_pagamentos" ADD COLUMN "disponivel_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "formas_pagamento" ADD CONSTRAINT "formas_pagamento_atualizado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formas_pagamento" ADD CONSTRAINT "formas_pagamento_conta_recebivel_empresa_fk" FOREIGN KEY ("conta_recebivel_id","empresa_id") REFERENCES "public"."contas"("id","empresa_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formas_pagamento" ADD CONSTRAINT "formas_pagamento_conta_final_empresa_fk" FOREIGN KEY ("conta_final_id","empresa_id") REFERENCES "public"."contas"("id","empresa_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas_pagamentos" ADD CONSTRAINT "vendas_pagamentos_conta_recebivel_id_contas_id_fk" FOREIGN KEY ("conta_recebivel_id") REFERENCES "public"."contas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas_pagamentos" ADD CONSTRAINT "vendas_pagamentos_conta_final_id_contas_id_fk" FOREIGN KEY ("conta_final_id") REFERENCES "public"."contas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vendas_pagamentos_conta_final_disponivel_idx" ON "vendas_pagamentos" USING btree ("conta_final_id") WHERE "vendas_pagamentos"."roteamento_status" = 'roteado' and "vendas_pagamentos"."disponivel_em" is not null;--> statement-breakpoint
CREATE INDEX "vendas_pagamentos_conta_recebivel_aberto_idx" ON "vendas_pagamentos" USING btree ("conta_recebivel_id") WHERE "vendas_pagamentos"."roteamento_status" = 'roteado' and "vendas_pagamentos"."disponivel_em" is null;--> statement-breakpoint
CREATE INDEX "vendas_pagamentos_roteamento_pendente_idx" ON "vendas_pagamentos" USING btree ("forma_pagamento_id") WHERE "vendas_pagamentos"."roteamento_status" = 'pendente';--> statement-breakpoint
ALTER TABLE "formas_pagamento" ADD CONSTRAINT "formas_pagamento_disponibilidade_check" CHECK ("formas_pagamento"."disponibilidade" is null or "formas_pagamento"."disponibilidade" in ('imediata', 'por_evento'));--> statement-breakpoint
ALTER TABLE "formas_pagamento" ADD CONSTRAINT "formas_pagamento_roteamento_check" CHECK (("formas_pagamento"."disponibilidade" is null and "formas_pagamento"."usa_conta_do_pdv" = false and "formas_pagamento"."conta_recebivel_id" is null and "formas_pagamento"."conta_final_id" is null)
       or ("formas_pagamento"."disponibilidade" is not distinct from 'imediata' and "formas_pagamento"."usa_conta_do_pdv" = true and "formas_pagamento"."conta_recebivel_id" is null and "formas_pagamento"."conta_final_id" is null)
       or ("formas_pagamento"."disponibilidade" is not distinct from 'por_evento' and "formas_pagamento"."usa_conta_do_pdv" = false and "formas_pagamento"."conta_recebivel_id" is not null and "formas_pagamento"."conta_final_id" is not null));--> statement-breakpoint
ALTER TABLE "vendas_pagamentos" ADD CONSTRAINT "vendas_pagamentos_roteamento_status_check" CHECK ("vendas_pagamentos"."roteamento_status" in ('nao_aplicavel', 'pendente', 'roteado'));--> statement-breakpoint
ALTER TABLE "vendas_pagamentos" ADD CONSTRAINT "vendas_pagamentos_roteamento_check" CHECK (("vendas_pagamentos"."roteamento_status" <> 'roteado' and "vendas_pagamentos"."conta_recebivel_id" is null and "vendas_pagamentos"."conta_final_id" is null and "vendas_pagamentos"."disponivel_em" is null)
       or ("vendas_pagamentos"."roteamento_status" = 'roteado' and "vendas_pagamentos"."conta_recebivel_id" is not null and "vendas_pagamentos"."conta_final_id" is not null));