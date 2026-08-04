-- PROJECT_BRAIN/17 D8 (S4): conta com FUNDO. `saldo_inicial` e o ponto de partida declarado no
-- cadastro (CONTA COFRE nasce com 10.000), NAO o saldo atual — este e derivado dos movimentos
-- (saldoContaCentavos), e a coluna nunca e sobrescrita por eles.
-- Gerada por drizzle-kit, sem edicao a mao. ADITIVA e sem backfill: DEFAULT '0' NOT NULL da a
-- toda conta existente o fundo 0, que e exatamente o que elas valem hoje (o conceito nao existia).
-- CHECK >= 0: fundo e ponto de partida de dinheiro guardado; conta que "comeca devendo" seria um
-- movimento, nao um fundo.
ALTER TABLE "contas" ADD COLUMN "saldo_inicial" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "contas" ADD CONSTRAINT "contas_saldo_inicial_check" CHECK ("contas"."saldo_inicial" >= 0);