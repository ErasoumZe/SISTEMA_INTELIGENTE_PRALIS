CREATE TABLE "admissoes_processos_ficha_anexos" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"ficha_id" uuid NOT NULL,
	"processo_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"nome_original" text NOT NULL,
	"nome_arquivo" text NOT NULL,
	"caminho" text NOT NULL,
	"mime_type" text NOT NULL,
	"tamanho_bytes" integer NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admissoes_processos_ficha_anexos_ficha_tipo_unico" UNIQUE("ficha_id","tipo"),
	CONSTRAINT "admissoes_processos_ficha_anexos_tipo_check" CHECK ("admissoes_processos_ficha_anexos"."tipo" in ('rg', 'cpf', 'titulo_eleitor', 'certidao_nascimento_casamento', 'comprovante_residencia', 'foto_3x4', 'ctps_digital', 'pis_pasep_nit', 'certificado_reservista', 'comprovante_escolaridade', 'certificados_profissionais', 'aso_admissional')),
	CONSTRAINT "admissoes_processos_ficha_anexos_tamanho_check" CHECK ("admissoes_processos_ficha_anexos"."tamanho_bytes" > 0)
);
--> statement-breakpoint
ALTER TABLE "admissoes_processos_ficha_anexos" ADD CONSTRAINT "admissoes_processos_ficha_anexos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_processos_ficha_anexos" ADD CONSTRAINT "admissoes_processos_ficha_anexos_ficha_id_admissoes_processos_ficha_id_fk" FOREIGN KEY ("ficha_id") REFERENCES "public"."admissoes_processos_ficha"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_processos_ficha_anexos" ADD CONSTRAINT "admissoes_processos_ficha_anexos_processo_id_admissoes_processos_id_fk" FOREIGN KEY ("processo_id") REFERENCES "public"."admissoes_processos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_processos_ficha_anexos" ADD CONSTRAINT "admissoes_processos_ficha_anexos_processo_empresa_fk" FOREIGN KEY ("processo_id","empresa_id") REFERENCES "public"."admissoes_processos"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admissoes_processos_ficha_anexos_empresa_ficha_idx" ON "admissoes_processos_ficha_anexos" USING btree ("empresa_id","ficha_id");