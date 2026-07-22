ALTER TABLE "integracoes_vinculos" DROP CONSTRAINT "integracoes_vinculos_tipo_registro_check";--> statement-breakpoint
ALTER TABLE "vendas" ADD COLUMN "colaborador_automacao_id" text;--> statement-breakpoint
ALTER TABLE "vendas" ADD COLUMN "colaborador_automacao" text;--> statement-breakpoint
ALTER TABLE "integracoes_vinculos" ADD CONSTRAINT "integracoes_vinculos_tipo_registro_check" CHECK ("integracoes_vinculos"."tipo_registro" in ('venda', 'pdv', 'cliente', 'produto', 'forma_pagamento', 'colaborador'));