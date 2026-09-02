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
--
-- Aplicar toma ACCESS EXCLUSIVE em `transferencias` e em `quebras_caixa`: os `ADD CONSTRAINT` nao
-- usam `NOT VALID` e o UNIQUE de tres colunas constroi um btree sobre a tabela inteira. Sem rewrite,
-- entao e rapido — mas escrita nas duas tabelas para durante a janela.
--
-- ============================================================================================
-- PONTO DE NAO RETORNO — ROLLBACK E SOMENTE PRE-USO
-- ============================================================================================
-- Antes de existir a PRIMEIRA transferencia `divergente` ou a PRIMEIRA quebra com
-- `transferencia_id`, esta migration e reversivel. Depois disso, NAO REVERTER: nao existe volta
-- correta, e tentar destroi dado. Os bloqueios, um a um:
--
--  1. `transferencias_status_check` nao volta aos quatro status — 23514 na hora.
--  2. `transferencias_solicitacao_cofre_check` nao volta: a versao antiga so admite
--     ('pendente','recebido') no ramo executado.
--  3. Nao ha status de destino honesto para essas linhas. `recebido` afirmaria que bateu E, sem
--     `valor_recebido`, creditaria o cofre pelo declarado — fabricando o dinheiro que nao chegou.
--     `cancelada` devolveria o valor ao Caixa, que e exatamente o que a R-183 proibe.
--  4. `DROP COLUMN valor_recebido` apaga o unico lugar onde vive o valor CONTADO e, como o saldo e
--     derivado, o credito volta a `valor_original` RETROATIVAMENTE em todo o historico. O numero
--     sobrevive parcialmente em `transferencias_conferencias_recusadas.valor_informado`, gravado no
--     mesmo ato — mas a fonte que o saldo le desaparece.
--  5. `quebras_caixa_fechamento_unico` (UNIQUE de coluna unica) NAO pode ser recriado assim que um
--     fechamento tiver duas quebras (contagem + divergencia) — 23505. Apagar uma delas seria apagar
--     divida real de alguem.
--  6. A entrega divergente com quebra nao pode mais ser apagada: a FK e ON DELETE RESTRICT.
--
-- Antes de qualquer tentativa de reversao, levantar:
--     select count(*) from transferencias where status = 'divergente';
--     select count(*) from quebras_caixa where transferencia_id is not null;
-- Se qualquer um for maior que zero, o caminho e para a frente (roll forward), nunca para tras.
-- ============================================================================================
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
