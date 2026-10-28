-- Promove os indices unicos (id, carga_id) da Central a restricao unica, sem apagar nem recriar nada: as FKs
-- compostas de produtos_central_grupos_fontes dependem deles. O schema passou a declarar unique() (padrao do
-- restante do projeto); assim o db:push dos testes cria a restricao junto com a tabela, antes das FKs.
ALTER TABLE "produtos_central_fontes" ADD CONSTRAINT "produtos_central_fontes_id_carga_unico" UNIQUE USING INDEX "produtos_central_fontes_id_carga_unico";--> statement-breakpoint
ALTER TABLE "produtos_central_grupos" ADD CONSTRAINT "produtos_central_grupos_id_carga_unico" UNIQUE USING INDEX "produtos_central_grupos_id_carga_unico";
