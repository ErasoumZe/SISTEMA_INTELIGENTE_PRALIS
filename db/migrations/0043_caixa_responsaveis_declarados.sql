ALTER TABLE "fechamentos_caixa" ADD COLUMN "caixa_responsavel_nome_abertura" text;--> statement-breakpoint
ALTER TABLE "fechamentos_caixa" ADD COLUMN "supervisor_responsavel_nome_abertura" text;--> statement-breakpoint
ALTER TABLE "fechamentos_caixa" ADD COLUMN "caixa_responsavel_nome_fechamento" text;--> statement-breakpoint
ALTER TABLE "fechamentos_caixa" ADD COLUMN "supervisor_responsavel_nome_fechamento" text;--> statement-breakpoint
ALTER TABLE "fechamentos_caixa" ADD CONSTRAINT "fechamentos_caixa_responsaveis_abertura_check" CHECK (("fechamentos_caixa"."caixa_responsavel_nome_abertura" is null and "fechamentos_caixa"."supervisor_responsavel_nome_abertura" is null)
        or (length(btrim("fechamentos_caixa"."caixa_responsavel_nome_abertura")) > 0
          and length(btrim("fechamentos_caixa"."supervisor_responsavel_nome_abertura")) > 0));--> statement-breakpoint
ALTER TABLE "fechamentos_caixa" ADD CONSTRAINT "fechamentos_caixa_responsaveis_fechamento_check" CHECK (("fechamentos_caixa"."caixa_responsavel_nome_fechamento" is null and "fechamentos_caixa"."supervisor_responsavel_nome_fechamento" is null)
        or ("fechamentos_caixa"."status" in ('fechado', 'ajustado')
          and length(btrim("fechamentos_caixa"."caixa_responsavel_nome_fechamento")) > 0
          and length(btrim("fechamentos_caixa"."supervisor_responsavel_nome_fechamento")) > 0));