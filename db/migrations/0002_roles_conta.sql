ALTER TABLE "perfis_usuarios" ADD COLUMN IF NOT EXISTS "role" text DEFAULT 'usuario_comum' NOT NULL;--> statement-breakpoint
ALTER TABLE "perfis_usuarios" DROP CONSTRAINT IF EXISTS "perfis_usuarios_role_check";--> statement-breakpoint
ALTER TABLE "perfis_usuarios" ADD CONSTRAINT "perfis_usuarios_role_check" CHECK ("perfis_usuarios"."role" in ('usuario_comum', 'usuario_admin', 'admin'));
