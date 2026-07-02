CREATE INDEX "debitos_colaboradores_empresa_colaborador_idx" ON "debitos_colaboradores" USING btree ("empresa_id","colaborador_id");--> statement-breakpoint
CREATE INDEX "despesas_empresa_data_idx" ON "despesas" USING btree ("empresa_id","data_referencia");--> statement-breakpoint
CREATE INDEX "despesas_caixa_idx" ON "despesas" USING btree ("caixa_id");--> statement-breakpoint
CREATE INDEX "despesas_itens_despesa_idx" ON "despesas_itens" USING btree ("despesa_id");--> statement-breakpoint
CREATE INDEX "fechamentos_caixa_empresa_data_idx" ON "fechamentos_caixa" USING btree ("empresa_id","data_movimento");--> statement-breakpoint
CREATE INDEX "mercadorias_empresa_data_idx" ON "mercadorias" USING btree ("empresa_id","data_referencia");--> statement-breakpoint
CREATE INDEX "mercadorias_caixa_idx" ON "mercadorias" USING btree ("caixa_id");--> statement-breakpoint
CREATE INDEX "mercadorias_itens_mercadoria_idx" ON "mercadorias_itens" USING btree ("mercadoria_id");--> statement-breakpoint
CREATE INDEX "retiradas_empresa_data_idx" ON "retiradas" USING btree ("empresa_id","data_referencia");--> statement-breakpoint
CREATE INDEX "retiradas_caixa_idx" ON "retiradas" USING btree ("caixa_id");--> statement-breakpoint
CREATE INDEX "transferencias_empresa_data_idx" ON "transferencias" USING btree ("empresa_id","data_referencia");--> statement-breakpoint
CREATE INDEX "transferencias_caixa_idx" ON "transferencias" USING btree ("caixa_id");--> statement-breakpoint
CREATE INDEX "vendas_empresa_data_idx" ON "vendas" USING btree ("empresa_id","data_referencia");--> statement-breakpoint
CREATE INDEX "vendas_caixa_idx" ON "vendas" USING btree ("caixa_id");--> statement-breakpoint
CREATE INDEX "vendas_pagamentos_venda_idx" ON "vendas_pagamentos" USING btree ("venda_id");--> statement-breakpoint
CREATE INDEX "vendas_produtos_venda_idx" ON "vendas_produtos" USING btree ("venda_id");