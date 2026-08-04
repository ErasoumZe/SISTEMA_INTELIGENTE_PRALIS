-- R-128 — a Retirada passa a ter credor FORNECEDOR ou SOCIO/GESTOR. Colaborador sai da tela.
--
-- O desenho do Rodrigo (FOTO 2) sempre disse "Fornecedor — (Despesas / Mercadorias / Retiradas)" e
-- "Socios — (Retiradas)". Colaborador nunca esteve na Retirada: o codigo divergiu do desenho.
--
-- A coluna `colaborador_id` FICA e os registros existentes NAO sao convertidos. O dev tem retirada
-- gravada com colaborador e producao pode vir a ter — converter faria o historico mentir sobre o
-- que foi lancado na epoca. O credor antigo continua legivel na lista e no detalhe.

-- 1) A coluna nova, no mesmo padrao de despesas.fornecedor_id: nullable, FK sem cascade.
ALTER TABLE "retiradas" ADD COLUMN "fornecedor_id" uuid;
--> statement-breakpoint
ALTER TABLE "retiradas" ADD CONSTRAINT "retiradas_fornecedor_id_fornecedores_id_fk"
  FOREIGN KEY ("fornecedor_id") REFERENCES "public"."fornecedores"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

-- 2) O CHECK do TIPO passa a aceitar 'fornecedor'. Mantem 'colaborador' na lista: as retiradas ja
--    gravadas com esse tipo continuam validas — o tipo sai da TELA, nao do historico.
ALTER TABLE "retiradas" DROP CONSTRAINT IF EXISTS "retiradas_credor_tipo_check";
--> statement-breakpoint
ALTER TABLE "retiradas" ADD CONSTRAINT "retiradas_credor_tipo_check"
  CHECK ("credor_tipo" is null or "credor_tipo" in ('fornecedor', 'colaborador', 'socio_gestor'));
--> statement-breakpoint

-- 3) O CHECK de COERENCIA ganha o ramo do fornecedor. Segue o mesmo desenho tolerante: so verifica
--    quando o tipo esta preenchido, para o historico de credor_tipo nulo continuar passando.
ALTER TABLE "retiradas" DROP CONSTRAINT IF EXISTS "retiradas_credor_coerente_check";
--> statement-breakpoint
ALTER TABLE "retiradas" ADD CONSTRAINT "retiradas_credor_coerente_check"
  CHECK (
    "credor_tipo" is null
    or ("credor_tipo" = 'fornecedor' and "colaborador_id" is null and "socio_gestor_id" is null)
    or ("credor_tipo" = 'colaborador' and "fornecedor_id" is null and "socio_gestor_id" is null)
    or ("credor_tipo" = 'socio_gestor' and "fornecedor_id" is null and "colaborador_id" is null)
  );
