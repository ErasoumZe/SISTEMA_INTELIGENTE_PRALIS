ALTER TABLE "funcoes_operacionais" ADD COLUMN "questor_codigo_cargo" text;--> statement-breakpoint
ALTER TABLE "funcoes_operacionais" ADD COLUMN "questor_agente_nocivo" text;--> statement-breakpoint
ALTER TABLE "turnos" ADD COLUMN "questor_codigo_escala" text;--> statement-breakpoint
ALTER TABLE "turnos" ADD COLUMN "questor_tipo_jornada" smallint;--> statement-breakpoint
ALTER TABLE "turnos" ADD COLUMN "questor_tempo_parcial" smallint;--> statement-breakpoint
ALTER TABLE "turnos" ADD COLUMN "questor_regime_jornada" smallint;--> statement-breakpoint
ALTER TABLE "funcoes_operacionais" ADD CONSTRAINT "funcoes_operacionais_questor_cargo_check" CHECK ("funcoes_operacionais"."questor_codigo_cargo" is null or "funcoes_operacionais"."questor_codigo_cargo" ~ '^[0-9]{1,7}$');--> statement-breakpoint
ALTER TABLE "funcoes_operacionais" ADD CONSTRAINT "funcoes_operacionais_questor_agente_check" CHECK ("funcoes_operacionais"."questor_agente_nocivo" is null or "funcoes_operacionais"."questor_agente_nocivo" in ('00', '15', '20', '25'));--> statement-breakpoint
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_questor_escala_check" CHECK ("turnos"."questor_codigo_escala" is null or "turnos"."questor_codigo_escala" ~ '^[0-9]{1,6}$');--> statement-breakpoint
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_questor_tipo_jornada_check" CHECK ("turnos"."questor_tipo_jornada" is null or "turnos"."questor_tipo_jornada" in (2, 3, 4, 5, 6, 7, 9));--> statement-breakpoint
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_questor_tempo_parcial_check" CHECK ("turnos"."questor_tempo_parcial" is null or "turnos"."questor_tempo_parcial" in (0, 1, 2, 3));--> statement-breakpoint
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_questor_regime_check" CHECK ("turnos"."questor_regime_jornada" is null or "turnos"."questor_regime_jornada" in (1, 2, 3, 4));