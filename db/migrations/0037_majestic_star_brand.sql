ALTER TABLE "admissoes_processos" DROP CONSTRAINT "admissoes_processos_status_check";--> statement-breakpoint
ALTER TABLE "admissoes_processos" DROP CONSTRAINT "admissoes_processos_coerencia_status_check";--> statement-breakpoint
ALTER TABLE "admissoes_processos" DROP CONSTRAINT "admissoes_processos_origem_coerencia_check";--> statement-breakpoint
ALTER TABLE "admissoes_processos_historico" DROP CONSTRAINT "admissoes_processos_historico_acao_check";--> statement-breakpoint
ALTER TABLE "admissoes_processos_internos" DROP CONSTRAINT "admissoes_processos_internos_exame_check";--> statement-breakpoint
ALTER TABLE "admissoes_processos" ADD COLUMN "nome_completo" text;--> statement-breakpoint
ALTER TABLE "admissoes_processos" ADD COLUMN "cpf" text;--> statement-breakpoint
ALTER TABLE "admissoes_processos" ADD COLUMN "turno_id" uuid;--> statement-breakpoint
ALTER TABLE "admissoes_processos" ADD COLUMN "turno_rotulo" text;--> statement-breakpoint
ALTER TABLE "admissoes_processos" ADD COLUMN "turno_etiqueta" text;--> statement-breakpoint
ALTER TABLE "admissoes_processos" ADD COLUMN "turno_hora_inicio" time;--> statement-breakpoint
ALTER TABLE "admissoes_processos" ADD COLUMN "turno_hora_fim" time;--> statement-breakpoint
ALTER TABLE "admissoes_processos" ADD COLUMN "turno_dias_semana" text[];--> statement-breakpoint
ALTER TABLE "turnos" ADD COLUMN "etiqueta" text;--> statement-breakpoint
ALTER TABLE "turnos" ADD COLUMN "dias_semana" text[];--> statement-breakpoint
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_id_empresa_unica" UNIQUE("id","empresa_id");--> statement-breakpoint
ALTER TABLE "admissoes_processos" ADD CONSTRAINT "admissoes_processos_turno_empresa_fk" FOREIGN KEY ("turno_id","empresa_id") REFERENCES "public"."turnos"("id","empresa_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admissoes_processos_cpf_ativo_unico" ON "admissoes_processos" USING btree ("empresa_id","cpf") WHERE "admissoes_processos"."cpf" is not null and "admissoes_processos"."status" <> 'cancelado';--> statement-breakpoint
ALTER TABLE "admissoes_processos" ADD CONSTRAINT "admissoes_processos_nome_check" CHECK ("admissoes_processos"."nome_completo" is null or length(btrim("admissoes_processos"."nome_completo")) > 0);--> statement-breakpoint
ALTER TABLE "admissoes_processos" ADD CONSTRAINT "admissoes_processos_cpf_check" CHECK ("admissoes_processos"."cpf" is null or "admissoes_processos"."cpf" ~ '^[0-9]{11}$');--> statement-breakpoint
ALTER TABLE "admissoes_processos" ADD CONSTRAINT "admissoes_processos_status_check" CHECK ("admissoes_processos"."status" in ('iniciado', 'pausado', 'cancelado'));--> statement-breakpoint
ALTER TABLE "admissoes_processos" ADD CONSTRAINT "admissoes_processos_coerencia_status_check" CHECK ((
        "admissoes_processos"."status" in ('iniciado', 'pausado')
        and "admissoes_processos"."cancelado_por" is null and "admissoes_processos"."cancelado_em" is null
      ) or (
        "admissoes_processos"."status" = 'cancelado'
        and "admissoes_processos"."cancelado_por" is not null and "admissoes_processos"."cancelado_em" is not null
      ));--> statement-breakpoint
ALTER TABLE "admissoes_processos" ADD CONSTRAINT "admissoes_processos_origem_coerencia_check" CHECK ((
        "admissoes_processos"."origem" = 'teste_efetivado'
        and "admissoes_processos"."teste_id" is not null
        and "admissoes_processos"."nome_completo" is null and "admissoes_processos"."cpf" is null
        and "admissoes_processos"."funcao_id" is null and "admissoes_processos"."turno_id" is null
        and "admissoes_processos"."jornada_horario" is null
      ) or (
        "admissoes_processos"."origem" = 'admissao_direta'
        and "admissoes_processos"."teste_id" is null
        and "admissoes_processos"."nome_completo" is not null and "admissoes_processos"."cpf" is not null
        and "admissoes_processos"."funcao_id" is not null and "admissoes_processos"."turno_id" is not null
      ));--> statement-breakpoint
ALTER TABLE "admissoes_processos_historico" ADD CONSTRAINT "admissoes_processos_historico_acao_check" CHECK ("admissoes_processos_historico"."acao" in ('criado', 'cancelado', 'internos_alterados', 'exame_alterado', 'pausado', 'retomado', 'cpf_revelado'));--> statement-breakpoint
ALTER TABLE "admissoes_processos_internos" ADD CONSTRAINT "admissoes_processos_internos_exame_check" CHECK ("admissoes_processos_internos"."exame_situacao" in ('pendente', 'guia_entregue', 'agendado', 'aso_apto', 'aso_nao_apto', 'exige_acao'));--> statement-breakpoint
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_etiqueta_check" CHECK ("turnos"."etiqueta" is null or "turnos"."etiqueta" in ('M', 'T', 'I'));--> statement-breakpoint
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_dias_semana_check" CHECK ("turnos"."dias_semana" is null or (
        array_length("turnos"."dias_semana", 1) > 0
        and "turnos"."dias_semana" <@ array['SEGUNDA','TERCA','QUARTA','QUINTA','SEXTA','SABADO','DOMINGO']::text[]
      ));