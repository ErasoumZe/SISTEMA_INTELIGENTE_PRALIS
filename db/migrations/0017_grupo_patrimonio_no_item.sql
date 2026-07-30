-- PROJECT_BRAIN/17 §5, item 6: o campo Grupo da discriminacao passa a aceitar tambem um grupo do
-- cadastro de PATRIMONIO ("se maquinario/manutencao"). Coluna PROPRIA porque grupo_despesa_id /
-- grupo_mercadoria_id sao FKs de outras tabelas e nao aceitam um id de patrimonio.
-- Gerada por drizzle-kit, sem edicao a mao. Nao ha backfill: coluna nova, nula em todo o historico.
--
-- CHECK = num_nonnulls(...) <= 1 (MUTUAMENTE EXCLUSIVO), nao "= 1". Decidido com o Jose em 30/07:
-- grupo de item e OPCIONAL nas duas origens — o contrato (zod .optional().nullable()), o servico
-- (so exige grupo no cabecalho quando nao ha itens) e a UI (opcao vazia no select) sempre
-- permitiram item sem grupo, e o historico esta cheio deles. Um "= 1" nem aplicaria: o
-- ADD CONSTRAINT valida a tabela inteira e abortaria na primeira linha legada.
ALTER TABLE "despesas_itens" ADD COLUMN "grupo_patrimonio_id" uuid;--> statement-breakpoint
ALTER TABLE "mercadorias_itens" ADD COLUMN "grupo_patrimonio_id" uuid;--> statement-breakpoint
ALTER TABLE "despesas_itens" ADD CONSTRAINT "despesas_itens_grupo_patrimonio_id_grupos_patrimonio_id_fk" FOREIGN KEY ("grupo_patrimonio_id") REFERENCES "public"."grupos_patrimonio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mercadorias_itens" ADD CONSTRAINT "mercadorias_itens_grupo_patrimonio_id_grupos_patrimonio_id_fk" FOREIGN KEY ("grupo_patrimonio_id") REFERENCES "public"."grupos_patrimonio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "despesas_itens_grupo_patrimonio_idx" ON "despesas_itens" USING btree ("grupo_patrimonio_id") WHERE "despesas_itens"."grupo_patrimonio_id" is not null;--> statement-breakpoint
CREATE INDEX "mercadorias_itens_grupo_patrimonio_idx" ON "mercadorias_itens" USING btree ("grupo_patrimonio_id") WHERE "mercadorias_itens"."grupo_patrimonio_id" is not null;--> statement-breakpoint
ALTER TABLE "despesas_itens" ADD CONSTRAINT "despesas_itens_grupo_unico_check" CHECK (num_nonnulls("despesas_itens"."grupo_despesa_id", "despesas_itens"."grupo_patrimonio_id") <= 1);--> statement-breakpoint
ALTER TABLE "mercadorias_itens" ADD CONSTRAINT "mercadorias_itens_grupo_unico_check" CHECK (num_nonnulls("mercadorias_itens"."grupo_mercadoria_id", "mercadorias_itens"."grupo_patrimonio_id") <= 1);