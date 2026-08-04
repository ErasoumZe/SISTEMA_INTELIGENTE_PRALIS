CREATE TABLE "transferencias_destinos_candidatos" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"transferencia_id" uuid NOT NULL,
	"conta_id" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transferencias_destinos_candidatos_unica" UNIQUE("transferencia_id","conta_id")
);
--> statement-breakpoint
ALTER TABLE "transferencias" DROP CONSTRAINT "transferencias_status_check";--> statement-breakpoint
ALTER TABLE "transferencias" ALTER COLUMN "status" SET DEFAULT 'recebido';--> statement-breakpoint
ALTER TABLE "transferencias" ADD COLUMN "n_lacre_doc" text;--> statement-breakpoint
ALTER TABLE "transferencias" ADD COLUMN "agendada_para" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "transferencias" ADD COLUMN "tempo_confirmacao" text;--> statement-breakpoint
ALTER TABLE "transferencias" ADD COLUMN "prazo_confirmacao_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "transferencias" ADD COLUMN "data_recebimento" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "transferencias" ADD COLUMN "confirmado_por" text;--> statement-breakpoint
ALTER TABLE "transferencias" ADD COLUMN "trava_liberada_por" text;--> statement-breakpoint
ALTER TABLE "transferencias" ADD COLUMN "trava_liberada_em" timestamp with time zone;--> statement-breakpoint
UPDATE "transferencias"
SET "status" = CASE
	WHEN "status" = 'cancelado' THEN 'cancelada'
	WHEN "status" = 'aguardando_aprovacao' THEN 'pendente'
	ELSE 'recebido'
END;--> statement-breakpoint
ALTER TABLE "transferencias_destinos_candidatos" ADD CONSTRAINT "transferencias_destinos_candidatos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferencias_destinos_candidatos" ADD CONSTRAINT "transferencias_destinos_candidatos_transferencia_id_transferencias_id_fk" FOREIGN KEY ("transferencia_id") REFERENCES "public"."transferencias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferencias_destinos_candidatos" ADD CONSTRAINT "transferencias_destinos_candidatos_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transferencias_destinos_candidatos_conta_idx" ON "transferencias_destinos_candidatos" USING btree ("conta_id");--> statement-breakpoint
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_confirmado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("confirmado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_trava_liberada_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("trava_liberada_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_prazo_check" CHECK ("transferencias"."tempo_confirmacao" is null or "transferencias"."tempo_confirmacao" in ('5min', '10min', '30min', '1h', '1dia', '10dias', '30dias'));--> statement-breakpoint

-- BACKFILL antes de restringir. A 0001_baseline criou `status` com default 'aprovado' e o CHECK
-- ('aprovado', 'aguardando_aprovacao', 'cancelado'). Esta migration troca o vocabulario inteiro e,
-- na redacao original, NAO convertia o dado existente: qualquer linha gravada no vocabulario antigo
-- fazia o ADD CONSTRAINT abaixo abortar — e, como a API so sobe depois do passo de migrate
-- (`depends_on: service_completed_successfully`), isso derruba o deploy, nao so a migration.
-- Encontrado em 04/08/2026 lendo a producao ANTES do merge: 1 transferencia com status antigo.
--
-- O mapeamento respeita o que cada linha consegue sustentar nos CHECKs novos:
--   'cancelado'            -> 'cancelada'  (mesma coisa, so o genero mudou)
--   'aguardando_aprovacao' -> 'pendente'   (nao foi aprovada; virar 'recebido' seria mentira)
--   'aprovado' e o resto   -> 'recebido' SE o tipo for de caixa (abertura/suprimento/sangria/
--                            retorno), que e o ramo que o `recebimento_check` aceita sem
--                            data_recebimento e confirmado_por; senao 'pendente', porque essas duas
--                            colunas nascem NULAS aqui e nao da para inventar quem confirmou.
UPDATE "transferencias"
SET "status" = CASE
    WHEN "status" = 'cancelado' THEN 'cancelada'
    WHEN "status" = 'aguardando_aprovacao' THEN 'pendente'
    WHEN "tipo" IN ('abertura', 'suprimento', 'sangria', 'retorno') THEN 'recebido'
    ELSE 'pendente'
  END
WHERE "status" NOT IN ('pendente', 'recebido', 'agendada', 'cancelada');--> statement-breakpoint

ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_recebimento_check" CHECK (("transferencias"."status" = 'recebido' and "transferencias"."data_recebimento" is not null and "transferencias"."confirmado_por" is not null)
        or ("transferencias"."status" <> 'recebido' and "transferencias"."data_recebimento" is null and "transferencias"."confirmado_por" is null)
        or ("transferencias"."tipo" in ('abertura', 'suprimento', 'sangria', 'retorno') and "transferencias"."status" = 'recebido'));--> statement-breakpoint
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_status_check" CHECK ("transferencias"."status" in ('pendente', 'recebido', 'agendada', 'cancelada'));
