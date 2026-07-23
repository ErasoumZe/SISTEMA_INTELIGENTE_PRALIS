ALTER TABLE "transferencias" ADD COLUMN "data_transferencia" date;--> statement-breakpoint
ALTER TABLE "transferencias" ADD COLUMN "vencimento" date;--> statement-breakpoint
ALTER TABLE "transferencias" ADD COLUMN "contabil" text;--> statement-breakpoint
ALTER TABLE "transferencias" ADD COLUMN "ordem" integer;--> statement-breakpoint
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_ordem_check" CHECK ("transferencias"."ordem" is null or "transferencias"."ordem" >= 1);