ALTER TABLE "empresas" ADD COLUMN "conta_cofre_id" uuid;--> statement-breakpoint
ALTER TABLE "fechamentos_caixa" ADD COLUMN "malote_abertura_id" uuid;--> statement-breakpoint
ALTER TABLE "fechamentos_caixa" ADD COLUMN "lacre_abertura" text;--> statement-breakpoint
ALTER TABLE "fechamentos_caixa" ADD COLUMN "divida_cofre" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "malotes" ADD COLUMN "valor" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "malotes" ADD COLUMN "status" text DEFAULT 'disponivel' NOT NULL;--> statement-breakpoint
ALTER TABLE "transferencias" ADD COLUMN "tipo" text DEFAULT 'suprimento' NOT NULL;--> statement-breakpoint
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_conta_cofre_id_contas_id_fk" FOREIGN KEY ("conta_cofre_id") REFERENCES "public"."contas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fechamentos_caixa" ADD CONSTRAINT "fechamentos_caixa_malote_abertura_id_malotes_id_fk" FOREIGN KEY ("malote_abertura_id") REFERENCES "public"."malotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "malotes" ADD CONSTRAINT "malotes_status_check" CHECK ("malotes"."status" in ('disponivel', 'em_uso', 'devolvido'));--> statement-breakpoint
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_tipo_check" CHECK ("transferencias"."tipo" in ('abertura', 'suprimento', 'sangria', 'retorno'));