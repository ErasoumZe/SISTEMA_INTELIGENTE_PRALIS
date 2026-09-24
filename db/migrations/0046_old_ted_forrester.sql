ALTER TABLE "lacres" ADD COLUMN "transferencia_distribuicao_id" uuid;--> statement-breakpoint
ALTER TABLE "lacres" ADD CONSTRAINT "lacres_distribuicao_empresa_fk" FOREIGN KEY ("transferencia_distribuicao_id","empresa_id") REFERENCES "public"."transferencias"("id","empresa_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lacres_distribuicao_disponivel_idx" ON "lacres" USING btree ("transferencia_distribuicao_id") WHERE "lacres"."transferencia_distribuicao_id" is not null
          and "lacres"."transferencia_id" is null
          and "lacres"."rompido" = false;--> statement-breakpoint
ALTER TABLE "lacres" ADD CONSTRAINT "lacres_distribuicao_retorno_check" CHECK ("lacres"."transferencia_distribuicao_id" is null
        or ("lacres"."origem" = 'retorno'
            and "lacres"."transferencia_distribuicao_id" is distinct from "lacres"."transferencia_id"
            and ("lacres"."transferencia_id" is not null or "lacres"."rompido" = false)));