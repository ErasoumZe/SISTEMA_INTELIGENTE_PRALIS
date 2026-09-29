ALTER TABLE "admissoes_processos_internos" ADD COLUMN "exame_tipo" text;--> statement-breakpoint
ALTER TABLE "admissoes_processos_internos" ADD COLUMN "exame_clinica" text;--> statement-breakpoint
ALTER TABLE "admissoes_processos_internos" ADD COLUMN "exame_unidade" text;--> statement-breakpoint
ALTER TABLE "admissoes_processos_internos" ADD COLUMN "exame_complementares" text;--> statement-breakpoint
ALTER TABLE "admissoes_processos_internos" ADD COLUMN "exame_agendado_para" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "admissoes_processos_internos" ADD COLUMN "exame_responsavel_nome" text;--> statement-breakpoint
ALTER TABLE "admissoes_processos_internos" ADD COLUMN "exame_responsavel_telefone" text;--> statement-breakpoint
ALTER TABLE "admissoes_processos_internos" ADD CONSTRAINT "admissoes_processos_internos_exame_tipo_check" CHECK ("admissoes_processos_internos"."exame_tipo" is null or "admissoes_processos_internos"."exame_tipo" in ('admissional', 'periodico', 'mudanca_funcao', 'retorno_trabalho', 'demissional', 'pcd'));--> statement-breakpoint
ALTER TABLE "admissoes_processos_internos" ADD CONSTRAINT "admissoes_processos_internos_exame_unidade_check" CHECK ("admissoes_processos_internos"."exame_unidade" is null or "admissoes_processos_internos"."exame_unidade" in ('centro', 'benfica'));--> statement-breakpoint
ALTER TABLE "admissoes_processos_internos" ADD CONSTRAINT "admissoes_processos_internos_exame_complementares_check" CHECK ("admissoes_processos_internos"."exame_complementares" is null or "admissoes_processos_internos"."exame_complementares" in ('sim', 'nao', 'nao_sabe'));--> statement-breakpoint
ALTER TABLE "admissoes_processos_internos" ADD CONSTRAINT "admissoes_processos_internos_exame_responsavel_telefone_check" CHECK ("admissoes_processos_internos"."exame_responsavel_telefone" is null or "admissoes_processos_internos"."exame_responsavel_telefone" ~ '^[0-9]{10,11}$');