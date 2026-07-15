CREATE TABLE "caixa_autorizacoes" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"caixa_id" uuid NOT NULL,
	"solicitante_id" text NOT NULL,
	"autorizador_id" text NOT NULL,
	"token_hash" text,
	"status" text DEFAULT 'pendente' NOT NULL,
	"observacao" text,
	"expira_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "caixa_autorizacoes_status_check" CHECK ("caixa_autorizacoes"."status" in ('pendente', 'usada', 'expirada', 'negada'))
);
--> statement-breakpoint
CREATE TABLE "turnos" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"hora_inicio" time NOT NULL,
	"hora_fim" time NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "turnos_empresa_nome_unica" UNIQUE("empresa_id","nome")
);
--> statement-breakpoint
ALTER TABLE "edicoes_caixa" ALTER COLUMN "token_usado" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "colaboradores" ADD COLUMN "turno_padrao_id" uuid;--> statement-breakpoint
ALTER TABLE "edicoes_caixa" ADD COLUMN "autorizador_id" text;--> statement-breakpoint
ALTER TABLE "edicoes_caixa" ADD COLUMN "observacao" text;--> statement-breakpoint
ALTER TABLE "fechamentos_caixa" ADD COLUMN "turno_id" uuid;--> statement-breakpoint
ALTER TABLE "caixa_autorizacoes" ADD CONSTRAINT "caixa_autorizacoes_caixa_id_fechamentos_caixa_id_fk" FOREIGN KEY ("caixa_id") REFERENCES "public"."fechamentos_caixa"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caixa_autorizacoes" ADD CONSTRAINT "caixa_autorizacoes_solicitante_id_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("solicitante_id") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caixa_autorizacoes" ADD CONSTRAINT "caixa_autorizacoes_autorizador_id_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("autorizador_id") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "caixa_autorizacoes_autorizador_status_idx" ON "caixa_autorizacoes" USING btree ("autorizador_id","status");--> statement-breakpoint
ALTER TABLE "colaboradores" ADD CONSTRAINT "colaboradores_turno_padrao_id_turnos_id_fk" FOREIGN KEY ("turno_padrao_id") REFERENCES "public"."turnos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edicoes_caixa" ADD CONSTRAINT "edicoes_caixa_autorizador_id_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("autorizador_id") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fechamentos_caixa" ADD CONSTRAINT "fechamentos_caixa_turno_id_turnos_id_fk" FOREIGN KEY ("turno_id") REFERENCES "public"."turnos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vendas_orfas_pdv_data_idx" ON "vendas" USING btree ("empresa_id","pdv_id","data_venda") WHERE "vendas"."caixa_id" is null;