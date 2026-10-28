CREATE TABLE "produtos_catalogo_base" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"id_origem" text NOT NULL,
	"codigo_interno" text,
	"codigo_barras" text,
	"nome" text NOT NULL,
	"status" text DEFAULT 'ativo' NOT NULL,
	"grupo_id_origem" text,
	"dados_oficiais" jsonb NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "produtos_catalogo_base_status_check" CHECK ("produtos_catalogo_base"."status" in ('ativo', 'inativo'))
);
--> statement-breakpoint
ALTER TABLE "produtos" ADD COLUMN "produto_base_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "produtos_catalogo_base_id_origem_uidx" ON "produtos_catalogo_base" USING btree ("id_origem");--> statement-breakpoint
CREATE INDEX "produtos_catalogo_base_codigo_interno_idx" ON "produtos_catalogo_base" USING btree ("codigo_interno");--> statement-breakpoint
CREATE INDEX "produtos_catalogo_base_codigo_barras_idx" ON "produtos_catalogo_base" USING btree ("codigo_barras");--> statement-breakpoint
CREATE INDEX "produtos_catalogo_base_nome_idx" ON "produtos_catalogo_base" USING btree ("nome");--> statement-breakpoint
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_produto_base_id_produtos_catalogo_base_id_fk" FOREIGN KEY ("produto_base_id") REFERENCES "public"."produtos_catalogo_base"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "produtos_empresa_produto_base_uidx" ON "produtos" USING btree ("empresa_id","produto_base_id") WHERE "produtos"."produto_base_id" is not null;