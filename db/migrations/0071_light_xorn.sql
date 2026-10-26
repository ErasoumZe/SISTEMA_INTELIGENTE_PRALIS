CREATE TABLE "admissoes_google_arquivos" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"sincronizacao_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"processo_id" uuid NOT NULL,
	"dependente_id" uuid,
	"origem" text NOT NULL,
	"colaborador_anexo_id" uuid,
	"dependente_anexo_id" uuid,
	"tipo_documento" text NOT NULL,
	"drive_folder_id" text,
	"drive_file_id" text,
	"drive_web_view_link" text,
	"status" text DEFAULT 'pendente' NOT NULL,
	"tentativa" integer DEFAULT 0 NOT NULL,
	"ultimo_erro_codigo" text,
	"ultimo_erro_mensagem" text,
	"proxima_tentativa_em" timestamp with time zone,
	"enviado_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admissoes_google_arquivos_origem_check" CHECK ((
        "admissoes_google_arquivos"."origem" = 'colaborador'
        and "admissoes_google_arquivos"."dependente_id" is null
        and "admissoes_google_arquivos"."colaborador_anexo_id" is not null
        and "admissoes_google_arquivos"."dependente_anexo_id" is null
      ) or (
        "admissoes_google_arquivos"."origem" = 'dependente'
        and "admissoes_google_arquivos"."dependente_id" is not null
        and "admissoes_google_arquivos"."colaborador_anexo_id" is null
        and "admissoes_google_arquivos"."dependente_anexo_id" is not null
      )),
	CONSTRAINT "admissoes_google_arquivos_status_check" CHECK ("admissoes_google_arquivos"."status" in ('pendente', 'processando', 'concluida', 'falhou')),
	CONSTRAINT "admissoes_google_arquivos_tentativa_check" CHECK ("admissoes_google_arquivos"."tentativa" >= 0)
);
--> statement-breakpoint
CREATE TABLE "admissoes_google_dependentes" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"sincronizacao_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"processo_id" uuid NOT NULL,
	"dependente_id" uuid NOT NULL,
	"status" text DEFAULT 'pendente' NOT NULL,
	"drive_dependente_folder_id" text,
	"sheets_row_number" integer,
	"sheets_metadata_id" text,
	"bloqueio_token" text,
	"bloqueio_ate" timestamp with time zone,
	"tentativa" integer DEFAULT 0 NOT NULL,
	"ultimo_erro_codigo" text,
	"ultimo_erro_mensagem" text,
	"proxima_tentativa_em" timestamp with time zone,
	"iniciado_em" timestamp with time zone,
	"concluido_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admissoes_google_dependentes_unico" UNIQUE("sincronizacao_id","dependente_id"),
	CONSTRAINT "admissoes_google_dependentes_status_check" CHECK ("admissoes_google_dependentes"."status" in ('pendente', 'processando', 'concluida', 'falhou')),
	CONSTRAINT "admissoes_google_dependentes_tentativa_check" CHECK ("admissoes_google_dependentes"."tentativa" >= 0),
	CONSTRAINT "admissoes_google_dependentes_row_check" CHECK ("admissoes_google_dependentes"."sheets_row_number" is null or "admissoes_google_dependentes"."sheets_row_number" > 0)
);
--> statement-breakpoint
CREATE TABLE "admissoes_google_sincronizacoes" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"processo_id" uuid NOT NULL,
	"status" text DEFAULT 'pendente' NOT NULL,
	"drive_root_folder_id" text NOT NULL,
	"drive_colaborador_folder_id" text,
	"sheets_colaborador_row_number" integer,
	"sheets_colaborador_metadata_id" text,
	"bloqueio_token" text,
	"bloqueio_ate" timestamp with time zone,
	"tentativa" integer DEFAULT 0 NOT NULL,
	"ultimo_erro_codigo" text,
	"ultimo_erro_mensagem" text,
	"proxima_tentativa_em" timestamp with time zone,
	"iniciado_em" timestamp with time zone,
	"concluido_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admissoes_google_sincronizacoes_processo_unico" UNIQUE("processo_id","empresa_id"),
	CONSTRAINT "admissoes_google_sincronizacoes_id_processo_empresa_unico" UNIQUE("id","processo_id","empresa_id"),
	CONSTRAINT "admissoes_google_sincronizacoes_status_check" CHECK ("admissoes_google_sincronizacoes"."status" in ('pendente', 'processando', 'concluida', 'falhou')),
	CONSTRAINT "admissoes_google_sincronizacoes_tentativa_check" CHECK ("admissoes_google_sincronizacoes"."tentativa" >= 0),
	CONSTRAINT "admissoes_google_sincronizacoes_row_check" CHECK ("admissoes_google_sincronizacoes"."sheets_colaborador_row_number" is null or "admissoes_google_sincronizacoes"."sheets_colaborador_row_number" > 0)
);
--> statement-breakpoint
ALTER TABLE "admissoes_google_arquivos" ADD CONSTRAINT "admissoes_google_arquivos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_google_arquivos" ADD CONSTRAINT "admissoes_google_arquivos_sincronizacao_fk" FOREIGN KEY ("sincronizacao_id","processo_id","empresa_id") REFERENCES "public"."admissoes_google_sincronizacoes"("id","processo_id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_google_arquivos" ADD CONSTRAINT "admissoes_google_arquivos_processo_empresa_fk" FOREIGN KEY ("processo_id","empresa_id") REFERENCES "public"."admissoes_processos"("id","empresa_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_google_arquivos" ADD CONSTRAINT "admissoes_google_arquivos_dependente_fk" FOREIGN KEY ("dependente_id","processo_id","empresa_id") REFERENCES "public"."admissoes_processos_dependentes"("id","processo_id","empresa_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_google_arquivos" ADD CONSTRAINT "admissoes_google_arquivos_colaborador_anexo_fk" FOREIGN KEY ("colaborador_anexo_id") REFERENCES "public"."admissoes_processos_ficha_anexos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_google_arquivos" ADD CONSTRAINT "admissoes_google_arquivos_dependente_anexo_fk" FOREIGN KEY ("dependente_anexo_id") REFERENCES "public"."admissoes_processos_dependentes_anexos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_google_dependentes" ADD CONSTRAINT "admissoes_google_dependentes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_google_dependentes" ADD CONSTRAINT "admissoes_google_dependentes_sincronizacao_fk" FOREIGN KEY ("sincronizacao_id","processo_id","empresa_id") REFERENCES "public"."admissoes_google_sincronizacoes"("id","processo_id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_google_dependentes" ADD CONSTRAINT "admissoes_google_dependentes_dependente_fk" FOREIGN KEY ("dependente_id","processo_id","empresa_id") REFERENCES "public"."admissoes_processos_dependentes"("id","processo_id","empresa_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_google_sincronizacoes" ADD CONSTRAINT "admissoes_google_sincronizacoes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes_google_sincronizacoes" ADD CONSTRAINT "admissoes_google_sincronizacoes_processo_empresa_fk" FOREIGN KEY ("processo_id","empresa_id") REFERENCES "public"."admissoes_processos"("id","empresa_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admissoes_google_arquivos_colaborador_anexo_unico" ON "admissoes_google_arquivos" USING btree ("colaborador_anexo_id") WHERE "admissoes_google_arquivos"."colaborador_anexo_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "admissoes_google_arquivos_dependente_anexo_unico" ON "admissoes_google_arquivos" USING btree ("dependente_anexo_id") WHERE "admissoes_google_arquivos"."dependente_anexo_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "admissoes_google_arquivos_drive_file_unico" ON "admissoes_google_arquivos" USING btree ("drive_file_id") WHERE "admissoes_google_arquivos"."drive_file_id" is not null;--> statement-breakpoint
CREATE INDEX "admissoes_google_arquivos_fila_idx" ON "admissoes_google_arquivos" USING btree ("status","proxima_tentativa_em","criado_em");--> statement-breakpoint
CREATE INDEX "admissoes_google_dependentes_fila_idx" ON "admissoes_google_dependentes" USING btree ("status","proxima_tentativa_em","criado_em");--> statement-breakpoint
CREATE INDEX "admissoes_google_sincronizacoes_fila_idx" ON "admissoes_google_sincronizacoes" USING btree ("status","proxima_tentativa_em","criado_em");--> statement-breakpoint
DO $$
DECLARE
  constraint_exists boolean;
  constraint_definition_matches boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'admissoes_processos_dependentes_id_processo_empresa_unico'
      AND conrelid = 'public.admissoes_processos_dependentes'::regclass
  )
  INTO constraint_exists;

  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid = 'public.admissoes_processos_dependentes'::regclass
      AND c.conname = 'admissoes_processos_dependentes_id_processo_empresa_unico'
      AND c.contype = 'u'
      AND c.conkey = ARRAY[
        (SELECT attnum FROM pg_attribute WHERE attrelid = c.conrelid AND attname = 'id'),
        (SELECT attnum FROM pg_attribute WHERE attrelid = c.conrelid AND attname = 'processo_id'),
        (SELECT attnum FROM pg_attribute WHERE attrelid = c.conrelid AND attname = 'empresa_id')
      ]::smallint[]
  )
  INTO constraint_definition_matches;

  IF constraint_exists AND NOT constraint_definition_matches THEN
    RAISE EXCEPTION 'constraint admissoes_processos_dependentes_id_processo_empresa_unico existe com definicao incompativel';
  END IF;

  IF NOT constraint_exists THEN
    ALTER TABLE "admissoes_processos_dependentes"
      ADD CONSTRAINT "admissoes_processos_dependentes_id_processo_empresa_unico"
      UNIQUE("id","processo_id","empresa_id");
  END IF;
END $$;
