ALTER TABLE "colaboradores" ADD COLUMN "turno_caixa" text;--> statement-breakpoint
ALTER TABLE "fechamentos_caixa" ADD COLUMN "turno_caixa" text;--> statement-breakpoint
ALTER TABLE "pdvs" ADD COLUMN "turnos_caixa" text[] DEFAULT ARRAY['manha','tarde']::text[] NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "colaboradores_posto_caixa_unico_idx" ON "colaboradores" USING btree ("empresa_id","pdv_padrao_id","turno_caixa") WHERE "colaboradores"."turno_caixa" is not null;--> statement-breakpoint
ALTER TABLE "colaboradores" ADD CONSTRAINT "colaboradores_turno_caixa_check" CHECK ("colaboradores"."turno_caixa" is null or ("colaboradores"."turno_caixa" in ('manha', 'tarde') and "colaboradores"."pdv_padrao_id" is not null));--> statement-breakpoint
ALTER TABLE "fechamentos_caixa" ADD CONSTRAINT "fechamentos_caixa_turno_caixa_check" CHECK ("fechamentos_caixa"."turno_caixa" is null or "fechamentos_caixa"."turno_caixa" in ('manha', 'tarde'));--> statement-breakpoint
ALTER TABLE "pdvs" ADD CONSTRAINT "pdvs_turnos_caixa_check" CHECK ("pdvs"."turnos_caixa" <@ ARRAY['manha','tarde']::text[] and cardinality("pdvs"."turnos_caixa") >= 1);