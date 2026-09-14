ALTER TABLE "admissoes_processos_dependentes" DROP CONSTRAINT "admissoes_processos_dependentes_cpf_check";--> statement-breakpoint
ALTER TABLE "admissoes_processos_dependentes" ADD CONSTRAINT "admissoes_processos_dependentes_cpf_check" CHECK ("admissoes_processos_dependentes"."cpf" is null or case
        when "admissoes_processos_dependentes"."cpf" !~ '^[0-9]{11}$' then false
        when "admissoes_processos_dependentes"."cpf" = repeat(substring("admissoes_processos_dependentes"."cpf", 1, 1), 11) then false
        else
          substring("admissoes_processos_dependentes"."cpf", 10, 1)::int = (((
            10 * substring("admissoes_processos_dependentes"."cpf", 1, 1)::int + 9 * substring("admissoes_processos_dependentes"."cpf", 2, 1)::int + 8 * substring("admissoes_processos_dependentes"."cpf", 3, 1)::int +
            7 * substring("admissoes_processos_dependentes"."cpf", 4, 1)::int + 6 * substring("admissoes_processos_dependentes"."cpf", 5, 1)::int + 5 * substring("admissoes_processos_dependentes"."cpf", 6, 1)::int +
            4 * substring("admissoes_processos_dependentes"."cpf", 7, 1)::int + 3 * substring("admissoes_processos_dependentes"."cpf", 8, 1)::int + 2 * substring("admissoes_processos_dependentes"."cpf", 9, 1)::int
            ) * 10) % 11) % 10
          and substring("admissoes_processos_dependentes"."cpf", 11, 1)::int = (((
            11 * substring("admissoes_processos_dependentes"."cpf", 1, 1)::int + 10 * substring("admissoes_processos_dependentes"."cpf", 2, 1)::int + 9 * substring("admissoes_processos_dependentes"."cpf", 3, 1)::int +
            8 * substring("admissoes_processos_dependentes"."cpf", 4, 1)::int + 7 * substring("admissoes_processos_dependentes"."cpf", 5, 1)::int + 6 * substring("admissoes_processos_dependentes"."cpf", 6, 1)::int +
            5 * substring("admissoes_processos_dependentes"."cpf", 7, 1)::int + 4 * substring("admissoes_processos_dependentes"."cpf", 8, 1)::int + 3 * substring("admissoes_processos_dependentes"."cpf", 9, 1)::int +
            2 * substring("admissoes_processos_dependentes"."cpf", 10, 1)::int
            ) * 10) % 11) % 10
      end);