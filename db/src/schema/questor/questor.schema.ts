import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid
} from "drizzle-orm/pg-core";
import { empresas, perfisUsuarios } from "../app.schema.js";

// E2 (M4) — configuração Questor por empresa e catálogo de códigos fornecido pela Conplus.
// Tamanhos e domínios: `shared/src/conplus/questor-parametros.ts`, derivado do layout oficial.
// Nenhuma coluna tem default de valor de negócio: o que a Conplus não confirmou fica NULL.

const criadoEm = timestamp("criado_em", { withTimezone: true }).notNull().defaultNow();
const atualizadoEm = timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow();
const idUuid = uuid("id")
  .primaryKey()
  .default(sql`uuid_generate_v7()`);

export const questorConfiguracoes = pgTable(
  "questor_configuracoes",
  {
    id: idUuid,
    empresaId: uuid("empresa_id").notNull(),
    // B.CODIGOESTAB (Inteiro 5).
    codigoEstabelecimento: integer("codigo_estabelecimento"),
    // B.CLASSIFORGAN (Texto 20).
    classificacaoOrganograma: text("classificacao_organograma"),
    // "Utiliza Hora Centesimal" da empresa no Questor (Eventos Variáveis). NULL = não confirmado.
    utilizaHoraCentesimal: boolean("utiliza_hora_centesimal"),
    // Código da empresa no Questor (coluna 2 do EventoVariavel.nli, inteiro de até 6 dígitos). Não é o
    // CNPJ que o TXT de admissão usa em CODIGOEMPRESA. NULL = DP ainda não informou.
    codigoEmpresaQuestor: integer("codigo_empresa_questor"),
    // Razão social da empresa como aparece nos arquivos da Conplus (coluna "Empresa" do catálogo de
    // eventos). Informada pelo DP; é a identidade que a importação do catálogo exige.
    razaoSocialQuestor: text("razao_social_questor"),
    // Valores-padrão por campo do layout; chaves e valores validados no serviço.
    padroes: jsonb("padroes")
      .$type<Record<string, string>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    versao: integer("versao").notNull().default(1),
    atualizadoPor: text("atualizado_por"),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    // Nomes explícitos: o automático da FK de atualizado_por passa de 63 caracteres e o Postgres trunca.
    foreignKey({
      columns: [table.empresaId],
      foreignColumns: [empresas.id],
      name: "questor_configuracoes_empresa_fk"
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.atualizadoPor],
      foreignColumns: [perfisUsuarios.usuarioId],
      name: "questor_configuracoes_atualizado_por_fk"
    }),
    unique("questor_configuracoes_empresa_unica").on(table.empresaId),
    check(
      "questor_configuracoes_estab_check",
      sql`${table.codigoEstabelecimento} is null or ${table.codigoEstabelecimento} between 0 and 99999`
    ),
    check(
      "questor_configuracoes_organograma_check",
      sql`${table.classificacaoOrganograma} is null or length(btrim(${table.classificacaoOrganograma})) between 1 and 20`
    ),
    check(
      "questor_configuracoes_codigo_empresa_check",
      sql`${table.codigoEmpresaQuestor} is null or ${table.codigoEmpresaQuestor} between 1 and 999999`
    ),
    check(
      "questor_configuracoes_razao_social_check",
      sql`${table.razaoSocialQuestor} is null or length(btrim(${table.razaoSocialQuestor})) between 1 and 200`
    ),
    check("questor_configuracoes_padroes_check", sql`jsonb_typeof(${table.padroes}) = 'object'`),
    check("questor_configuracoes_versao_check", sql`${table.versao} > 0`)
  ]
);

export const questorCodigos = pgTable(
  "questor_codigos",
  {
    id: idUuid,
    empresaId: uuid("empresa_id").notNull(),
    tabela: text("tabela").$type<"tipo_contrato" | "sindicato" | "cargo" | "escala" | "tipo_logradouro">().notNull(),
    codigo: text("codigo").notNull(),
    descricao: text("descricao").notNull(),
    ativo: boolean("ativo").notNull().default(true),
    criadoPor: text("criado_por"),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    foreignKey({
      columns: [table.empresaId],
      foreignColumns: [empresas.id],
      name: "questor_codigos_empresa_fk"
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.criadoPor],
      foreignColumns: [perfisUsuarios.usuarioId],
      name: "questor_codigos_criado_por_fk"
    }),
    unique("questor_codigos_unico").on(table.empresaId, table.tabela, table.codigo),
    check(
      "questor_codigos_tabela_check",
      sql`${table.tabela} in ('tipo_contrato', 'sindicato', 'cargo', 'escala', 'tipo_logradouro')`
    ),
    // Tamanho = campo do layout que o código alimenta (CODIGOTIPOCONTR 3, CODIGOSIND 5,
    // CODIGOCARGO 7, CODIGOESCALA 6, CODIGOTIPOLOGRAD 21). Todos "Inteiro" → só dígitos.
    check(
      "questor_codigos_codigo_check",
      sql`case ${table.tabela}
        when 'tipo_contrato' then ${table.codigo} ~ '^[0-9]{1,3}$'
        when 'sindicato' then ${table.codigo} ~ '^[0-9]{1,5}$'
        when 'cargo' then ${table.codigo} ~ '^[0-9]{1,7}$'
        when 'escala' then ${table.codigo} ~ '^[0-9]{1,6}$'
        when 'tipo_logradouro' then ${table.codigo} ~ '^[0-9]{1,21}$'
        else false
      end`
    ),
    check("questor_codigos_descricao_check", sql`length(btrim(${table.descricao})) between 1 and 120`)
  ]
);

export * from "./questor-exportacoes.schema.js";
