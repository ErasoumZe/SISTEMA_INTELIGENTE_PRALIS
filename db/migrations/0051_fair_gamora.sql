ALTER TABLE "admissoes_processos_ficha" DROP CONSTRAINT "admissoes_processos_ficha_situacao_check";--> statement-breakpoint
ALTER TABLE "admissoes_processos_ficha" DROP CONSTRAINT "admissoes_processos_ficha_coerencia_check";--> statement-breakpoint
ALTER TABLE "admissoes_processos_historico" DROP CONSTRAINT "admissoes_processos_historico_acao_check";--> statement-breakpoint
DROP INDEX "admissoes_processos_historico_evento_unico";--> statement-breakpoint
CREATE UNIQUE INDEX "admissoes_processos_historico_evento_unico" ON "admissoes_processos_historico" USING btree ("processo_id","versao") WHERE "admissoes_processos_historico"."acao" not in ('cpf_revelado', 'convite_gerado', 'convite_revogado', 'ficha_enviada', 'ficha_devolvida', 'ficha_aprovada', 'ficha_dp_alterada', 'ficha_dp_concluida');--> statement-breakpoint
ALTER TABLE "admissoes_processos_ficha" ADD CONSTRAINT "admissoes_processos_ficha_situacao_check" CHECK ("admissoes_processos_ficha"."situacao" in ('rascunho', 'enviada', 'devolvida', 'aprovada', 'rascunho_dp', 'concluida_dp'));--> statement-breakpoint
ALTER TABLE "admissoes_processos_ficha" ADD CONSTRAINT "admissoes_processos_ficha_coerencia_check" CHECK ((
        ("admissoes_processos_ficha"."situacao" = 'rascunho' and "admissoes_processos_ficha"."enviado_em" is null and "admissoes_processos_ficha"."revisado_em" is null)
        or ("admissoes_processos_ficha"."situacao" = 'enviada' and "admissoes_processos_ficha"."enviado_em" is not null and "admissoes_processos_ficha"."revisado_em" is null
            and "admissoes_processos_ficha"."aviso_aceito_em" is not null and "admissoes_processos_ficha"."aviso_privacidade_versao" is not null
            and "admissoes_processos_ficha"."sem_dependentes" is not null)
        or ("admissoes_processos_ficha"."situacao" = 'devolvida' and "admissoes_processos_ficha"."enviado_em" is not null
            and "admissoes_processos_ficha"."revisado_em" is not null and "admissoes_processos_ficha"."revisado_por" is not null
            and "admissoes_processos_ficha"."revisao_pendencias" is not null)
        or ("admissoes_processos_ficha"."situacao" = 'aprovada' and "admissoes_processos_ficha"."enviado_em" is not null
            and "admissoes_processos_ficha"."revisado_em" is not null and "admissoes_processos_ficha"."revisado_por" is not null)
        or ("admissoes_processos_ficha"."situacao" = 'rascunho_dp' and "admissoes_processos_ficha"."enviado_em" is null
            and "admissoes_processos_ficha"."revisado_em" is null and "admissoes_processos_ficha"."revisado_por" is null
            and "admissoes_processos_ficha"."revisao_pendencias" is null and "admissoes_processos_ficha"."aviso_aceito_em" is null
            and "admissoes_processos_ficha"."aviso_privacidade_versao" is null)
        or ("admissoes_processos_ficha"."situacao" = 'concluida_dp' and "admissoes_processos_ficha"."enviado_em" is null
            and "admissoes_processos_ficha"."revisado_em" is not null and "admissoes_processos_ficha"."revisado_por" is not null
            and "admissoes_processos_ficha"."revisao_pendencias" is null and "admissoes_processos_ficha"."aviso_aceito_em" is null
            and "admissoes_processos_ficha"."aviso_privacidade_versao" is null)
      ));--> statement-breakpoint
ALTER TABLE "admissoes_processos_historico" ADD CONSTRAINT "admissoes_processos_historico_acao_check" CHECK ("admissoes_processos_historico"."acao" in ('criado', 'cancelado', 'internos_alterados', 'exame_alterado', 'pausado', 'retomado', 'cpf_revelado', 'convite_gerado', 'convite_revogado', 'ficha_enviada', 'ficha_devolvida', 'ficha_aprovada', 'ficha_dp_alterada', 'ficha_dp_concluida', 'efetivado'));
