ALTER TABLE "fechamentos_caixa" DROP CONSTRAINT "fechamentos_caixa_status_check";--> statement-breakpoint
DROP INDEX "fechamentos_caixa_pdv_aberto_unico_idx";--> statement-breakpoint
DROP INDEX "fechamentos_caixa_operador_aberto_unico_idx";--> statement-breakpoint
ALTER TABLE "fechamentos_caixa" ADD COLUMN "fechamento_iniciado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "fechamentos_caixa" ADD COLUMN "fechamento_iniciado_por" text;--> statement-breakpoint
ALTER TABLE "fechamentos_caixa" ADD CONSTRAINT "fechamentos_caixa_fechamento_iniciado_por_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("fechamento_iniciado_por") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fechamentos_caixa_pdv_aberto_unico_idx" ON "fechamentos_caixa" USING btree ("pdv_id") WHERE "fechamentos_caixa"."status" in ('aberto', 'em_fechamento');--> statement-breakpoint
CREATE UNIQUE INDEX "fechamentos_caixa_operador_aberto_unico_idx" ON "fechamentos_caixa" USING btree ("empresa_id","usuario_caixa_id") WHERE "fechamentos_caixa"."status" in ('aberto', 'em_fechamento') and "fechamentos_caixa"."usuario_caixa_id" is not null;--> statement-breakpoint
ALTER TABLE "fechamentos_caixa" ADD CONSTRAINT "fechamentos_caixa_status_check" CHECK ("fechamentos_caixa"."status" in ('aberto', 'em_fechamento', 'fechado', 'ajustado'));