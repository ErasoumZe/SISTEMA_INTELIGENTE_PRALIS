CREATE TABLE "admissoes_processos_dependentes_anexos" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"dependente_id" uuid NOT NULL,
	"processo_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"nome_original" text NOT NULL,
	"nome_arquivo" text NOT NULL,
	"caminho" text NOT NULL,
	"mime_type" text NOT NULL,
	"tamanho_bytes" integer NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admissoes_processos_dependentes_anexos_tipo_check" CHECK ("admissoes_processos_dependentes_anexos"."tipo" in ('certidao_nascimento_rg', 'cpf', 'cartao_vacina', 'comprovante_escolaridade')),
	CONSTRAINT "admissoes_processos_dependentes_anexos_tamanho_check" CHECK ("admissoes_processos_dependentes_anexos"."tamanho_bytes" > 0)
);
--> statement-breakpoint
ALTER TABLE "admissoes_processos_dependentes_anexos" ADD CONSTRAINT "admissoes_processos_dependentes_anexos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Banco novo: a FK abaixo aponta para a UNIQUE (id, processo_id, empresa_id), que só era criada na
-- 0062. Bancos existentes já a tinham (vinda de push), então a 0061 passava neles e quebrava em banco
-- vazio. Mesmo bloco idempotente da 0062: cria se faltar, recusa definição divergente, nunca altera.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'public.admissoes_processos_dependentes'::regclass
      AND c.conname = 'admissoes_processos_dependentes_id_processo_empresa_unico'
      AND NOT (
        c.contype = 'u'
        AND c.conkey = ARRAY[
          (SELECT attnum FROM pg_attribute WHERE attrelid = c.conrelid AND attname = 'id'),
          (SELECT attnum FROM pg_attribute WHERE attrelid = c.conrelid AND attname = 'processo_id'),
          (SELECT attnum FROM pg_attribute WHERE attrelid = c.conrelid AND attname = 'empresa_id')
        ]::smallint[]
      )
  ) THEN
    RAISE EXCEPTION 'constraint admissoes_processos_dependentes_id_processo_empresa_unico existe com definicao incompativel';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'admissoes_processos_dependentes_id_processo_empresa_unico'
      AND conrelid = 'public.admissoes_processos_dependentes'::regclass
  ) THEN
    ALTER TABLE "admissoes_processos_dependentes"
      ADD CONSTRAINT "admissoes_processos_dependentes_id_processo_empresa_unico"
      UNIQUE("id","processo_id","empresa_id");
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "admissoes_processos_dependentes_anexos" ADD CONSTRAINT "admissoes_processos_dependentes_anexos_dependente_fk" FOREIGN KEY ("dependente_id","processo_id","empresa_id") REFERENCES "public"."admissoes_processos_dependentes"("id","processo_id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admissoes_processos_dependentes_anexos_tipo_unico" ON "admissoes_processos_dependentes_anexos" USING btree ("dependente_id","tipo");--> statement-breakpoint
CREATE INDEX "admissoes_processos_dependentes_anexos_empresa_dependente_idx" ON "admissoes_processos_dependentes_anexos" USING btree ("empresa_id","dependente_id");