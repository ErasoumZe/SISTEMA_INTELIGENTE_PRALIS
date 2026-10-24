ALTER TABLE "admissoes_processos_internos" ADD COLUMN "questor_tipo_salario" smallint;--> statement-breakpoint
ALTER TABLE "admissoes_processos_internos" ADD COLUMN "salario_centavos" bigint;--> statement-breakpoint
ALTER TABLE "admissoes_processos_internos" ADD COLUMN "descricao_salario" text;--> statement-breakpoint
ALTER TABLE "admissoes_processos_internos" ADD COLUMN "dias_experiencia" integer;--> statement-breakpoint
ALTER TABLE "admissoes_processos_internos" ADD COLUMN "dias_prorrogacao" integer;--> statement-breakpoint
ALTER TABLE "admissoes_processos_internos" ADD COLUMN "questor_tipo_contrato" text;--> statement-breakpoint
ALTER TABLE "admissoes_processos_internos" ADD COLUMN "questor_sindicato" text;--> statement-breakpoint
ALTER TABLE "admissoes_processos_internos" ADD COLUMN "questor_tipo_admissao" smallint;--> statement-breakpoint
ALTER TABLE "admissoes_processos_internos" ADD COLUMN "pcd_cotista" boolean;--> statement-breakpoint
ALTER TABLE "admissoes_processos_internos" ADD COLUMN "utiliza_ctps_digital" boolean;--> statement-breakpoint
ALTER TABLE "admissoes_processos_internos" ADD COLUMN "possui_alvara" boolean;--> statement-breakpoint
ALTER TABLE "admissoes_processos_internos" ADD COLUMN "ja_exposto_agente_nocivo" boolean;--> statement-breakpoint
ALTER TABLE "admissoes_processos_internos" ADD CONSTRAINT "internos_questor_tipo_salario_check" CHECK ("admissoes_processos_internos"."questor_tipo_salario" is null or "admissoes_processos_internos"."questor_tipo_salario" in (1, 2, 5, 6, 7));--> statement-breakpoint
ALTER TABLE "admissoes_processos_internos" ADD CONSTRAINT "internos_salario_check" CHECK ("admissoes_processos_internos"."salario_centavos" is null or "admissoes_processos_internos"."salario_centavos" between 1 and 999999999999999);--> statement-breakpoint
ALTER TABLE "admissoes_processos_internos" ADD CONSTRAINT "internos_descricao_salario_check" CHECK ("admissoes_processos_internos"."descricao_salario" is null or length(btrim("admissoes_processos_internos"."descricao_salario")) between 1 and 999);--> statement-breakpoint
ALTER TABLE "admissoes_processos_internos" ADD CONSTRAINT "internos_descricao_salario_condicional_check" CHECK ("admissoes_processos_internos"."questor_tipo_salario" is null or "admissoes_processos_internos"."questor_tipo_salario" not in (2, 6) or length(btrim(coalesce("admissoes_processos_internos"."descricao_salario", ''))) > 0);--> statement-breakpoint
ALTER TABLE "admissoes_processos_internos" ADD CONSTRAINT "internos_dias_experiencia_check" CHECK ("admissoes_processos_internos"."dias_experiencia" is null or "admissoes_processos_internos"."dias_experiencia" between 0 and 99999);--> statement-breakpoint
ALTER TABLE "admissoes_processos_internos" ADD CONSTRAINT "internos_dias_prorrogacao_check" CHECK ("admissoes_processos_internos"."dias_prorrogacao" is null or "admissoes_processos_internos"."dias_prorrogacao" between 0 and 9999);--> statement-breakpoint
ALTER TABLE "admissoes_processos_internos" ADD CONSTRAINT "internos_questor_tipo_contrato_check" CHECK ("admissoes_processos_internos"."questor_tipo_contrato" is null or "admissoes_processos_internos"."questor_tipo_contrato" ~ '^[0-9]{1,3}$');--> statement-breakpoint
ALTER TABLE "admissoes_processos_internos" ADD CONSTRAINT "internos_questor_sindicato_check" CHECK ("admissoes_processos_internos"."questor_sindicato" is null or "admissoes_processos_internos"."questor_sindicato" ~ '^[0-9]{1,5}$');--> statement-breakpoint
ALTER TABLE "admissoes_processos_internos" ADD CONSTRAINT "internos_questor_tipo_admissao_check" CHECK ("admissoes_processos_internos"."questor_tipo_admissao" is null or "admissoes_processos_internos"."questor_tipo_admissao" between 1 and 7);