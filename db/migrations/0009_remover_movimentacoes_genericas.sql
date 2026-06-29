ALTER TABLE "ajustes_fechamento_caixa" DROP COLUMN IF EXISTS "movimentacao_id";--> statement-breakpoint
ALTER TABLE "debitos_colaboradores" DROP COLUMN IF EXISTS "movimentacao_id";--> statement-breakpoint
DROP TABLE IF EXISTS "itens_despesas";--> statement-breakpoint
DROP TABLE IF EXISTS "itens_mercadorias";--> statement-breakpoint
DROP TABLE IF EXISTS "movimentacoes_financeiras";
