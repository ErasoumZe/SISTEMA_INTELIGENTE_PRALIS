ALTER TABLE "admissoes_processos_internos" DROP CONSTRAINT "admissoes_processos_internos_exame_unidade_check";--> statement-breakpoint
ALTER TABLE "admissoes_processos_internos" ADD COLUMN "exame_clinica_id" uuid;--> statement-breakpoint
ALTER TABLE "admissoes_processos_internos" ADD COLUMN "exame_unidade_id" uuid;--> statement-breakpoint
