ALTER TABLE "admissoes_processos_dependentes" ADD COLUMN "sexo" text;--> statement-breakpoint
ALTER TABLE "admissoes_processos_dependentes" ADD COLUMN "estado_civil" text;--> statement-breakpoint
ALTER TABLE "admissoes_processos_dependentes" ADD COLUMN "grau_instrucao" text;--> statement-breakpoint
ALTER TABLE "admissoes_processos_dependentes" ADD COLUMN "nacionalidade" text;--> statement-breakpoint
ALTER TABLE "admissoes_processos_ficha" ADD COLUMN "naturalidade_uf" text;--> statement-breakpoint
ALTER TABLE "admissoes_processos_ficha" ADD COLUMN "municipio_ibge" text;--> statement-breakpoint
ALTER TABLE "admissoes_processos_ficha" ADD COLUMN "nacionalidade_especifica" text;--> statement-breakpoint
ALTER TABLE "admissoes_processos_ficha" ADD COLUMN "primeiro_emprego" boolean;--> statement-breakpoint
ALTER TABLE "admissoes_processos_ficha" ADD COLUMN "recebe_seguro_desemprego" boolean;--> statement-breakpoint
ALTER TABLE "admissoes_processos_ficha" ADD CONSTRAINT "admissoes_processos_ficha_naturalidade_uf_check" CHECK ("admissoes_processos_ficha"."naturalidade_uf" is null or "admissoes_processos_ficha"."naturalidade_uf" ~ '^[A-Z]{2}$');--> statement-breakpoint
ALTER TABLE "admissoes_processos_ficha" ADD CONSTRAINT "admissoes_processos_ficha_municipio_ibge_check" CHECK ("admissoes_processos_ficha"."municipio_ibge" is null or "admissoes_processos_ficha"."municipio_ibge" ~ '^[0-9]{7}$');