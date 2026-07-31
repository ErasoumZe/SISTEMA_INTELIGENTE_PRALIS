-- S2 (PROJECT_BRAIN/19): os campos da FOTO 2 que apareciam na tela e NAO chegavam ao banco.
-- Fecha R-041 (juros % ou R$), R-044/R-045 (documento fiscal), R-046/R-047 (credor tipado +
-- socio/gestor) e R-049 (segunda foto). Gerada por drizzle-kit; os COMMENT ON COLUMN do fim foram
-- escritos a mao (o gerador nao emite comentario) e sao parte da entrega, nao enfeite: sem eles a
-- proxima pessoa le "valor_acrescimo" e assume acrescimo generico.
--
-- Aprovada pelo Jose em 30/07 com quatro decisoes:
--   (a) juros REAPROVEITA valor_acrescimo (ja esta dentro de liquidoCentavos) + 2 colunas novas;
--   (b) retirada ganha as DUAS fotos — a D12 tirou so a discriminacao, nunca as fotos;
--   (c) socio/gestor SO em retiradas — despesa e mercadoria nao ofertam;
--   (d) juros_tipo usa 'percentual' | 'valor', a MESMA convencao do desconto_geral_tipo que ja
--       existia. Duas convencoes para o mesmo conceito era o conflito com regra antiga a matar.
--
-- Nenhum CHECK usa cardinalidade retroativa (num_nonnulls <= 1): a despesa que existe hoje no dev
-- tem fornecedor_id E colaborador_id preenchidos e abortaria a migration inteira. E a licao da 0017.
CREATE TABLE "socios_gestores" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "retiradas" ALTER COLUMN "colaborador_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "despesas" ADD COLUMN "credor_tipo" text;--> statement-breakpoint
ALTER TABLE "despesas" ADD COLUMN "data_documento_fiscal" date;--> statement-breakpoint
ALTER TABLE "despesas" ADD COLUMN "numero_documento_fiscal" text;--> statement-breakpoint
ALTER TABLE "despesas" ADD COLUMN "juros_tipo" text;--> statement-breakpoint
ALTER TABLE "despesas" ADD COLUMN "juros_valor_informado" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "despesas" ADD COLUMN "foto_nota_url" text;--> statement-breakpoint
ALTER TABLE "mercadorias" ADD COLUMN "credor_tipo" text;--> statement-breakpoint
ALTER TABLE "mercadorias" ADD COLUMN "data_documento_fiscal" date;--> statement-breakpoint
ALTER TABLE "mercadorias" ADD COLUMN "numero_documento_fiscal" text;--> statement-breakpoint
ALTER TABLE "mercadorias" ADD COLUMN "juros_tipo" text;--> statement-breakpoint
ALTER TABLE "mercadorias" ADD COLUMN "juros_valor_informado" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "mercadorias" ADD COLUMN "foto_nota_url" text;--> statement-breakpoint
ALTER TABLE "retiradas" ADD COLUMN "credor_tipo" text;--> statement-breakpoint
ALTER TABLE "retiradas" ADD COLUMN "socio_gestor_id" uuid;--> statement-breakpoint
ALTER TABLE "retiradas" ADD COLUMN "data_documento_fiscal" date;--> statement-breakpoint
ALTER TABLE "retiradas" ADD COLUMN "numero_documento_fiscal" text;--> statement-breakpoint
ALTER TABLE "retiradas" ADD COLUMN "juros_tipo" text;--> statement-breakpoint
ALTER TABLE "retiradas" ADD COLUMN "juros_valor_informado" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "retiradas" ADD COLUMN "foto_documento_url" text;--> statement-breakpoint
ALTER TABLE "retiradas" ADD COLUMN "foto_nota_url" text;--> statement-breakpoint
ALTER TABLE "socios_gestores" ADD CONSTRAINT "socios_gestores_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "socios_gestores_empresa_nome_unico" ON "socios_gestores" USING btree ("empresa_id",lower("nome"));--> statement-breakpoint
CREATE INDEX "socios_gestores_empresa_idx" ON "socios_gestores" USING btree ("empresa_id");--> statement-breakpoint
ALTER TABLE "retiradas" ADD CONSTRAINT "retiradas_socio_gestor_id_socios_gestores_id_fk" FOREIGN KEY ("socio_gestor_id") REFERENCES "public"."socios_gestores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "despesas" ADD CONSTRAINT "despesas_juros_tipo_check" CHECK ("despesas"."juros_tipo" is null or "despesas"."juros_tipo" in ('percentual', 'valor'));--> statement-breakpoint
ALTER TABLE "despesas" ADD CONSTRAINT "despesas_juros_valor_informado_check" CHECK ("despesas"."juros_valor_informado" is null or "despesas"."juros_valor_informado" >= 0);--> statement-breakpoint
ALTER TABLE "despesas" ADD CONSTRAINT "despesas_credor_tipo_check" CHECK ("despesas"."credor_tipo" is null or "despesas"."credor_tipo" in ('fornecedor', 'colaborador'));--> statement-breakpoint
ALTER TABLE "despesas" ADD CONSTRAINT "despesas_credor_coerente_check" CHECK ("despesas"."credor_tipo" is null
        or ("despesas"."credor_tipo" = 'fornecedor' and "despesas"."colaborador_id" is null)
        or ("despesas"."credor_tipo" = 'colaborador' and "despesas"."fornecedor_id" is null));--> statement-breakpoint
ALTER TABLE "mercadorias" ADD CONSTRAINT "mercadorias_juros_tipo_check" CHECK ("mercadorias"."juros_tipo" is null or "mercadorias"."juros_tipo" in ('percentual', 'valor'));--> statement-breakpoint
ALTER TABLE "mercadorias" ADD CONSTRAINT "mercadorias_juros_valor_informado_check" CHECK ("mercadorias"."juros_valor_informado" is null or "mercadorias"."juros_valor_informado" >= 0);--> statement-breakpoint
ALTER TABLE "mercadorias" ADD CONSTRAINT "mercadorias_credor_tipo_check" CHECK ("mercadorias"."credor_tipo" is null or "mercadorias"."credor_tipo" = 'fornecedor');--> statement-breakpoint
ALTER TABLE "retiradas" ADD CONSTRAINT "retiradas_juros_tipo_check" CHECK ("retiradas"."juros_tipo" is null or "retiradas"."juros_tipo" in ('percentual', 'valor'));--> statement-breakpoint
ALTER TABLE "retiradas" ADD CONSTRAINT "retiradas_juros_valor_informado_check" CHECK ("retiradas"."juros_valor_informado" is null or "retiradas"."juros_valor_informado" >= 0);--> statement-breakpoint
ALTER TABLE "retiradas" ADD CONSTRAINT "retiradas_credor_tipo_check" CHECK ("retiradas"."credor_tipo" is null or "retiradas"."credor_tipo" in ('colaborador', 'socio_gestor'));--> statement-breakpoint
ALTER TABLE "retiradas" ADD CONSTRAINT "retiradas_credor_coerente_check" CHECK ("retiradas"."credor_tipo" is null
        or ("retiradas"."credor_tipo" = 'colaborador' and "retiradas"."socio_gestor_id" is null)
        or ("retiradas"."credor_tipo" = 'socio_gestor' and "retiradas"."colaborador_id" is null));--> statement-breakpoint

-- Escrito a mao: o drizzle-kit nao gera COMMENT. Sem isto, "valor_acrescimo" nestas 3 tabelas e uma
-- armadilha — o nome diz acrescimo generico e o conteudo e juros.
COMMENT ON COLUMN "despesas"."valor_acrescimo" IS 'R-041: nesta tabela e o JUROS em R$, SEMPRE ja calculado (percentual ja aplicado sobre valor_original). E esta coluna que entra em liquidoCentavos(original - desconto + acrescimo); guardar o percentual aqui somaria 2,00 no lugar de 20,00 e corromperia caixa, conta e relatorio. O tipo esta em juros_tipo e o que a pessoa digitou em juros_valor_informado. Em vendas/transferencias a coluna de mesmo nome segue sendo acrescimo generico.';--> statement-breakpoint
COMMENT ON COLUMN "mercadorias"."valor_acrescimo" IS 'R-041: idem despesas.valor_acrescimo — JUROS em R$ ja calculado, nao acrescimo generico.';--> statement-breakpoint
COMMENT ON COLUMN "retiradas"."valor_acrescimo" IS 'R-041: idem despesas.valor_acrescimo — JUROS em R$ ja calculado, nao acrescimo generico.';--> statement-breakpoint

COMMENT ON COLUMN "despesas"."juros_tipo" IS 'R-041: percentual | valor. MESMA convencao de desconto_geral_tipo (decisao do Jose, 30/07): valor = R$ absoluto, percentual = % sobre valor_original.';--> statement-breakpoint
COMMENT ON COLUMN "mercadorias"."juros_tipo" IS 'R-041: percentual | valor — ver despesas.juros_tipo.';--> statement-breakpoint
COMMENT ON COLUMN "retiradas"."juros_tipo" IS 'R-041: percentual | valor — ver despesas.juros_tipo.';--> statement-breakpoint

COMMENT ON COLUMN "despesas"."juros_valor_informado" IS 'R-041: o que a pessoa DIGITOU (2 para 2%, 20.00 para R$ 20,00). Existe porque guardar so o R$ perde a informacao de que era 2%, e recalcular por divisao deriva com arredondamento: 333,33 a 2% da 6,67, que de volta vira 2,001%. A tela reabre com este valor.';--> statement-breakpoint
COMMENT ON COLUMN "mercadorias"."juros_valor_informado" IS 'R-041: idem despesas.juros_valor_informado.';--> statement-breakpoint
COMMENT ON COLUMN "retiradas"."juros_valor_informado" IS 'R-041: idem despesas.juros_valor_informado.';--> statement-breakpoint

-- descricao_acrescimo fica SEM USO nestas 3 tabelas (um campo, um nome). Nao inventar funcao nova
-- para ela; se um dia sobrar, e DROP COLUMN em migration propria.
COMMENT ON COLUMN "despesas"."descricao_acrescimo" IS 'SEM USO desde a 0020: o campo generico de acrescimo foi aposentado no lancamento, que passou a ter juros com tipo proprio (R-041). Mantida so para nao perder historico. Nao usar em codigo novo.';--> statement-breakpoint
COMMENT ON COLUMN "mercadorias"."descricao_acrescimo" IS 'SEM USO desde a 0020 — ver despesas.descricao_acrescimo.';--> statement-breakpoint
COMMENT ON COLUMN "retiradas"."descricao_acrescimo" IS 'SEM USO desde a 0020 — ver despesas.descricao_acrescimo.';--> statement-breakpoint

COMMENT ON COLUMN "retiradas"."colaborador_id" IS 'R-047: deixou de ser NOT NULL na 0020 — quando o credor e socio/gestor nao ha colaborador, e exigir um forcaria inventar. A coerencia com credor_tipo e garantida por retiradas_credor_coerente_check.';--> statement-breakpoint
COMMENT ON COLUMN "despesas"."foto_nota_url" IS 'R-049: foto 2 = a nota COM OS ITENS. A foto 1 (recibo/boleto/nota) e foto_documento_url.';--> statement-breakpoint
COMMENT ON COLUMN "mercadorias"."foto_nota_url" IS 'R-049: foto 2 = a nota COM OS ITENS.';--> statement-breakpoint
COMMENT ON COLUMN "retiradas"."foto_nota_url" IS 'R-049: foto 2 = a nota COM OS ITENS. Retirada nao tinha nenhuma foto antes da 0020.';