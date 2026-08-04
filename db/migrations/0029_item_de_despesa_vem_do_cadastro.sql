-- E6 — o item da discriminacao passa a vir de um CADASTRO, e nao de texto livre.
--
-- Na mercadoria isso ja existia: `mercadorias_itens.produto_id` aponta o produto, e a descricao e o
-- grupo vem dele. Na despesa faltava o equivalente: havia `grupo_patrimonio_id` (o GRUPO) e
-- `colaborador_id`, mas nao o ITEM de patrimonio. Decisao do Jose (04/08/2026): na despesa o item
-- vem de Patrimonio e de Colaboradores.
--
-- `despesas_itens` ja tem quantidade, valor_unitario, os descontos e os *_com_desconto (vieram na
-- 0016) — por isso igualar as duas telas custa UMA coluna, e nao a tabela inteira.
--
-- NULLABLE de proposito. Toda despesa discriminada ate hoje tem descricao digitada a mao e nenhum
-- vinculo; exigir o item aqui tornaria esses registros invalidos retroativamente. A obrigatoriedade
-- e do FORMULARIO e do servico, para lancamento NOVO — o historico continua abrindo e sendo salvo
-- com o texto que tem.
ALTER TABLE "despesas_itens" ADD COLUMN "patrimonio_item_id" uuid;
--> statement-breakpoint
ALTER TABLE "despesas_itens" ADD CONSTRAINT "despesas_itens_patrimonio_item_id_patrimonio_itens_id_fk"
  FOREIGN KEY ("patrimonio_item_id") REFERENCES "public"."patrimonio_itens"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "despesas_itens_patrimonio_item_idx" ON "despesas_itens" USING btree ("patrimonio_item_id");
