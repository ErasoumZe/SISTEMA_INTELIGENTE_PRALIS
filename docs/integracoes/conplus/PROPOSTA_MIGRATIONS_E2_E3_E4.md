# Proposta de migrations — E2 (M4), E3 (M5), E4 (M3)

Data: 22/10/2026 · Status: **INCORPORADA ao repositório em 22/10/2026** (`db/migrations/0064`–`0066`, journal com 67 entradas). **Não aplicada em nenhum banco existente.**

> **Versão oficial: `db/migrations/0064_questor_configuracao.sql`, `0065_questor_cadastros.sql`,
> `0066_questor_contrato_dp.sql`** + `db/src/schema/questor/questor.schema.ts`. Na incorporação, o CHECK
> condicional da descrição salarial passou a recusar também texto só com espaços. Diferenças em relação ao rascunho abaixo: o índice
> parcial `questor_codigos_empresa_tabela_idx` foi **removido** (redundante com a UNIQUE
> `(empresa_id, tabela, codigo)`), e as FKs da M4 ganharam nomes explícitos curtos (o nome automático
> passava de 63 caracteres). Este documento fica como justificativa das decisões.

O SQL abaixo segue as convenções das migrations atuais (`uuid_generate_v7()`, `empresa_id` com FK
em cascade, `criado_em`/`atualizado_em` com trigger `set_atualizado_em`, CHECK nomeado). Ao ser
aprovado, vira migration gerada pelo Drizzle a partir do `app.schema.ts` — **uma por entrega** — e
o número é atribuído na hora, depois de conferir com o Codex a numeração da fila (0064+).

Princípio comum às três: **toda coluna nova é anulável e sem default inventado.** Código e
parâmetro do Questor que a Conplus não confirmou ficam `NULL`; a prévia de prontidão mostra o campo
como pendente. Nenhuma linha existente é alterada (só `ADD COLUMN`/`CREATE TABLE`).

Tamanhos e domínios vêm de `LAYOUT_ADMISSAO_QUESTOR` (documentação oficial + NLI). Os mesmos
limites estão no Zod (`shared/src/conplus/questor-parametros.ts`), que é a primeira barreira; o
CHECK é a segunda.

---

## M4 — E2: configuração Questor por empresa + catálogo de códigos

```sql
CREATE TABLE "questor_configuracoes" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
  "empresa_id" uuid NOT NULL,
  -- B.CODIGOESTAB (Inteiro 5): código da matriz/filial no Questor. NULL até a Conplus informar.
  "codigo_estabelecimento" integer,
  -- B.CLASSIFORGAN (Texto 20).
  "classificacao_organograma" text,
  -- Eventos Variáveis: "Utiliza Hora Centesimal" da empresa no Questor. NULL = não confirmado.
  "utiliza_hora_centesimal" boolean,
  -- Valores-padrão por campo do layout. Chaves e valores validados no serviço contra o layout.
  "padroes" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "versao" integer DEFAULT 1 NOT NULL,
  "atualizado_por" text,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "questor_configuracoes_empresa_unica" UNIQUE("empresa_id"),
  CONSTRAINT "questor_configuracoes_estab_check" CHECK ("codigo_estabelecimento" IS NULL OR "codigo_estabelecimento" BETWEEN 0 AND 99999),
  CONSTRAINT "questor_configuracoes_organograma_check" CHECK ("classificacao_organograma" IS NULL OR length(btrim("classificacao_organograma")) BETWEEN 1 AND 20),
  CONSTRAINT "questor_configuracoes_padroes_check" CHECK (jsonb_typeof("padroes") = 'object'),
  CONSTRAINT "questor_configuracoes_versao_check" CHECK ("versao" > 0)
);
--> statement-breakpoint
CREATE TABLE "questor_codigos" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
  "empresa_id" uuid NOT NULL,
  "tabela" text NOT NULL,
  "codigo" text NOT NULL,
  "descricao" text NOT NULL,
  "ativo" boolean DEFAULT true NOT NULL,
  "criado_por" text,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "questor_codigos_unico" UNIQUE("empresa_id","tabela","codigo"),
  CONSTRAINT "questor_codigos_tabela_check" CHECK ("tabela" IN ('tipo_contrato','sindicato','cargo','escala','tipo_logradouro')),
  -- Tamanho = campo do layout que o código alimenta (CODIGOTIPOCONTR 3, CODIGOSIND 5,
  -- CODIGOCARGO 7, CODIGOESCALA 6, CODIGOTIPOLOGRAD 21). Só dígitos: todos são "Inteiro".
  CONSTRAINT "questor_codigos_codigo_check" CHECK (
    CASE "tabela"
      WHEN 'tipo_contrato'   THEN "codigo" ~ '^[0-9]{1,3}$'
      WHEN 'sindicato'       THEN "codigo" ~ '^[0-9]{1,5}$'
      WHEN 'cargo'           THEN "codigo" ~ '^[0-9]{1,7}$'
      WHEN 'escala'          THEN "codigo" ~ '^[0-9]{1,6}$'
      WHEN 'tipo_logradouro' THEN "codigo" ~ '^[0-9]{1,21}$'
      ELSE false
    END),
  CONSTRAINT "questor_codigos_descricao_check" CHECK (length(btrim("descricao")) BETWEEN 1 AND 120)
);
--> statement-breakpoint
ALTER TABLE "questor_configuracoes" ADD CONSTRAINT "questor_configuracoes_empresa_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "questor_configuracoes" ADD CONSTRAINT "questor_configuracoes_atualizado_por_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."perfis_usuarios"("usuario_id");
--> statement-breakpoint
ALTER TABLE "questor_codigos" ADD CONSTRAINT "questor_codigos_empresa_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "questor_codigos" ADD CONSTRAINT "questor_codigos_criado_por_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."perfis_usuarios"("usuario_id");
--> statement-breakpoint
CREATE INDEX "questor_codigos_empresa_tabela_idx" ON "questor_codigos" ("empresa_id","tabela") WHERE "ativo";
--> statement-breakpoint
CREATE TRIGGER "questor_configuracoes_set_atualizado_em" BEFORE UPDATE ON "questor_configuracoes" FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
--> statement-breakpoint
CREATE TRIGGER "questor_codigos_set_atualizado_em" BEFORE UPDATE ON "questor_codigos" FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
```

Decisões embutidas, para revisão:

- **Catálogo sem exclusão física**: `ativo = false` desativa; código já usado numa admissão
  continua legível. Mesmo padrão das funções operacionais.
- **Sem FK do código para o catálogo** em funções/turnos/internos: a FK precisaria da coluna
  `tabela` em cada tabela que referencia. A pertença ao catálogo **ativo da mesma empresa** é
  verificada no serviço (`verificarCodigosNoCatalogoQuestor`). Se Marco preferir FK, a alternativa é
  uma coluna gerada `tabela` + FK composta `(empresa_id, tabela, codigo)`.
- **`padroes` em jsonb** em vez de 16 colunas: chaves restritas a `CAMPOS_PADRAO_EMPRESA_QUESTOR` e
  valores ao domínio oficial, validados no Zod e no serviço.
- **Não há tabela de eventos**: o catálogo de eventos variáveis precisa da letra H/R/V por evento e
  fica para a M7 (E7), que depende do modelo CSV da Conplus.

## M5 — E3: códigos Questor nos cadastros de Funções e Turnos

```sql
ALTER TABLE "funcoes_operacionais"
  ADD COLUMN "questor_codigo_cargo" text,
  ADD COLUMN "questor_agente_nocivo" text;
--> statement-breakpoint
ALTER TABLE "funcoes_operacionais"
  ADD CONSTRAINT "funcoes_operacionais_questor_cargo_check" CHECK ("questor_codigo_cargo" IS NULL OR "questor_codigo_cargo" ~ '^[0-9]{1,7}$'),
  -- B.AGENTENOCIVO: 00 (não exposição), 15, 20, 25 — lista fechada da documentação.
  ADD CONSTRAINT "funcoes_operacionais_questor_agente_check" CHECK ("questor_agente_nocivo" IS NULL OR "questor_agente_nocivo" IN ('00','15','20','25'));
--> statement-breakpoint
ALTER TABLE "turnos"
  ADD COLUMN "questor_codigo_escala" text,
  ADD COLUMN "questor_tipo_jornada" smallint,
  ADD COLUMN "questor_tempo_parcial" smallint,
  ADD COLUMN "questor_regime_jornada" smallint;
--> statement-breakpoint
ALTER TABLE "turnos"
  ADD CONSTRAINT "turnos_questor_escala_check" CHECK ("questor_codigo_escala" IS NULL OR "questor_codigo_escala" ~ '^[0-9]{1,6}$'),
  ADD CONSTRAINT "turnos_questor_tipo_jornada_check" CHECK ("questor_tipo_jornada" IS NULL OR "questor_tipo_jornada" IN (2,3,4,5,6,7,9)),
  ADD CONSTRAINT "turnos_questor_tempo_parcial_check" CHECK ("questor_tempo_parcial" IS NULL OR "questor_tempo_parcial" IN (0,1,2,3)),
  ADD CONSTRAINT "turnos_questor_regime_check" CHECK ("questor_regime_jornada" IS NULL OR "questor_regime_jornada" IN (1,2,3,4));
```

Sem default — inclusive `agente_nocivo`: "00" é uma declaração sobre exposição ocupacional, e
quem declara é o DP, não o banco. As telas de Funções e Turnos são do escopo atual do DP; a coluna
nova entra nelas na E3, coordenada com o Codex.

## M3 — E4: dados contratuais do DP (estende `admissoes_processos_internos`)

`internos` já é o bloco do DP, 1:1 com o processo e com `versao` para concorrência otimista; uma
tabela nova seria um segundo lugar para o mesmo ato.

```sql
ALTER TABLE "admissoes_processos_internos"
  ADD COLUMN "questor_tipo_salario" smallint,
  ADD COLUMN "salario_centavos" bigint,
  ADD COLUMN "descricao_salario" text,
  ADD COLUMN "dias_experiencia" integer,
  ADD COLUMN "dias_prorrogacao" integer,
  ADD COLUMN "questor_tipo_contrato" text,
  ADD COLUMN "questor_sindicato" text,
  ADD COLUMN "questor_tipo_admissao" smallint,
  ADD COLUMN "pcd_cotista" boolean,
  ADD COLUMN "utiliza_ctps_digital" boolean,
  ADD COLUMN "possui_alvara" boolean,
  ADD COLUMN "ja_exposto_agente_nocivo" boolean;
--> statement-breakpoint
ALTER TABLE "admissoes_processos_internos"
  ADD CONSTRAINT "internos_questor_tipo_salario_check" CHECK ("questor_tipo_salario" IS NULL OR "questor_tipo_salario" IN (1,2,5,6,7)),
  -- VALORSAL: Numérico 16 com 2 casas → até 13 dígitos inteiros.
  ADD CONSTRAINT "internos_salario_check" CHECK ("salario_centavos" IS NULL OR "salario_centavos" BETWEEN 1 AND 999999999999999),
  ADD CONSTRAINT "internos_descricao_salario_check" CHECK ("descricao_salario" IS NULL OR length(btrim("descricao_salario")) BETWEEN 1 AND 999),
  -- Doc: DESCRSAL obrigatório se TIPOSALARIO = 2 (Comissão/Variável) ou 6 (Tarefa).
  ADD CONSTRAINT "internos_descricao_salario_condicional_check" CHECK ("questor_tipo_salario" IS NULL OR "questor_tipo_salario" NOT IN (2,6) OR "descricao_salario" IS NOT NULL),
  ADD CONSTRAINT "internos_dias_experiencia_check" CHECK ("dias_experiencia" IS NULL OR "dias_experiencia" BETWEEN 0 AND 99999),
  ADD CONSTRAINT "internos_dias_prorrogacao_check" CHECK ("dias_prorrogacao" IS NULL OR "dias_prorrogacao" BETWEEN 0 AND 9999),
  ADD CONSTRAINT "internos_questor_tipo_contrato_check" CHECK ("questor_tipo_contrato" IS NULL OR "questor_tipo_contrato" ~ '^[0-9]{1,3}$'),
  ADD CONSTRAINT "internos_questor_sindicato_check" CHECK ("questor_sindicato" IS NULL OR "questor_sindicato" ~ '^[0-9]{1,5}$'),
  ADD CONSTRAINT "internos_questor_tipo_admissao_check" CHECK ("questor_tipo_admissao" IS NULL OR "questor_tipo_admissao" BETWEEN 1 AND 7);
```

Ficam **fora** da M3, de propósito:

- **CATEGESOCIAL, CATEGORIA, TIPOVINCULO** — dependem das modalidades de contratação e seus
  códigos (Q4). Entram quando a Conplus responder; até lá, a prévia mostra pendência `externo`.
- **Exceções aos padrões sindicais e de RAIS/CAGED** — o plano previa `sobrescritas_questor`;
  só entram se o DP precisar trocar um padrão da empresa caso a caso.
- **Salário não é derivado de nada**: nem de `colaboradores_cargos.remuneracao_minuto`, nem do
  turno. É digitado pelo DP (AGENTS 4.6 — fórmula de dinheiro).

## Ordem sugerida de aplicação

M4 → M5 → M3. A M5 e a M3 guardam códigos que o serviço confere contra o catálogo da M4.
