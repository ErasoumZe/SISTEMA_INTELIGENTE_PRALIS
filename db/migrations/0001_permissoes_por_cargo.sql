ALTER TABLE "perfis_usuarios" DROP CONSTRAINT IF EXISTS "perfis_usuarios_papel_check";--> statement-breakpoint
ALTER TABLE "perfis_usuarios" DROP COLUMN IF EXISTS "papel";--> statement-breakpoint
DROP TABLE IF EXISTS "permissoes_papeis";--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "permissoes_cargos" (
	"cargo_id" uuid NOT NULL,
	"permissao_codigo" text NOT NULL,
	CONSTRAINT "permissoes_cargos_cargo_id_permissao_codigo_pk" PRIMARY KEY("cargo_id","permissao_codigo")
);--> statement-breakpoint
ALTER TABLE "permissoes_cargos" DROP CONSTRAINT IF EXISTS "permissoes_cargos_cargo_id_cargos_id_fk";--> statement-breakpoint
ALTER TABLE "permissoes_cargos" ADD CONSTRAINT "permissoes_cargos_cargo_id_cargos_id_fk" FOREIGN KEY ("cargo_id") REFERENCES "public"."cargos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permissoes_cargos" DROP CONSTRAINT IF EXISTS "permissoes_cargos_permissao_codigo_permissoes_codigo_fk";--> statement-breakpoint
ALTER TABLE "permissoes_cargos" ADD CONSTRAINT "permissoes_cargos_permissao_codigo_permissoes_codigo_fk" FOREIGN KEY ("permissao_codigo") REFERENCES "public"."permissoes"("codigo") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
UPDATE "colaboradores"
SET "usuario_id" = NULL
WHERE "usuario_id" IS NOT NULL
	AND NOT EXISTS (
		SELECT 1
		FROM "perfis_usuarios"
		WHERE "perfis_usuarios"."usuario_id" = "colaboradores"."usuario_id"
	);--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'colaboradores_usuario_id_perfis_usuarios_usuario_id_fk'
	) THEN
		ALTER TABLE "colaboradores" ADD CONSTRAINT "colaboradores_usuario_id_perfis_usuarios_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."perfis_usuarios"("usuario_id") ON DELETE set null ON UPDATE no action;
	END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "colaboradores_usuario_id_unico" ON "colaboradores" ("usuario_id") WHERE "usuario_id" is not null;
