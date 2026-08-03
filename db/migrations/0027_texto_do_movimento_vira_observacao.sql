-- R-127 — o texto do movimento passa a viver em `observacao`.
--
-- As quatro tabelas de movimento tinham DUAS colunas de texto: `descricao` (NOT NULL, era o que a
-- tela gravava) e `observacao` (nullable, sem uso). Decisao do Jose (01/08/2026): o texto e
-- OBSERVACAO. `descricao` deixa de ser obrigatoria e sai numa migration FUTURA, depois de producao
-- rodar estavel — apagar coluna com dado real em vespera de entrega e como se perde historico.
--
-- ORDEM IMPORTA: o BACKFILL vem antes de afrouxar a coluna, como na 0026 com o lacre. Depois deste
-- passo, todo registro que tinha texto tem `observacao` preenchida — e a leitura com fallback no
-- codigo passa a ser apenas rede de seguranca, nao a fonte do dado.

-- 1) O texto existente migra para `observacao` onde ela esta vazia. `nullif(...,'')` trata a
--    string vazia como ausente: ha registro com observacao = '' que precisa receber o texto igual.
UPDATE "despesas" SET "observacao" = "descricao"
WHERE nullif("observacao", '') IS NULL AND nullif("descricao", '') IS NOT NULL;
--> statement-breakpoint
UPDATE "mercadorias" SET "observacao" = "descricao"
WHERE nullif("observacao", '') IS NULL AND nullif("descricao", '') IS NOT NULL;
--> statement-breakpoint
UPDATE "retiradas" SET "observacao" = "descricao"
WHERE nullif("observacao", '') IS NULL AND nullif("descricao", '') IS NOT NULL;
--> statement-breakpoint
UPDATE "transferencias" SET "observacao" = "descricao"
WHERE nullif("observacao", '') IS NULL AND nullif("descricao", '') IS NOT NULL;
--> statement-breakpoint

-- 2) So agora `descricao` deixa de ser obrigatoria. A coluna FICA: enquanto producao nao rodar
--    estavel, ela e a rede de seguranca de qualquer leitura que ainda dependa dela.
ALTER TABLE "despesas" ALTER COLUMN "descricao" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "mercadorias" ALTER COLUMN "descricao" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "retiradas" ALTER COLUMN "descricao" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "transferencias" ALTER COLUMN "descricao" DROP NOT NULL;
