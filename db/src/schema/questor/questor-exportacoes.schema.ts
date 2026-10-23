import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";
import { admissoesProcessos } from "../admissoes/admissoes.schema.js";
import { empresas, perfisUsuarios } from "../app.schema.js";
import { colaboradoresVinculos } from "../app.schema.js";

const idUuid = uuid("id")
  .primaryKey()
  .default(sql`uuid_generate_v7()`);
const criadoEm = timestamp("criado_em", { withTimezone: true }).notNull().defaultNow();
const atualizadoEm = timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow();

export const questorExportacoes = pgTable(
  "questor_exportacoes",
  {
    id: idUuid,
    empresaId: uuid("empresa_id").notNull(),
    tipo: text("tipo").$type<"admissao" | "eventos_variaveis">().notNull(),
    competencia: date("competencia"),
    layoutVersao: text("layout_versao").notNull(),
    sha256: text("sha256").notNull(),
    chaveIdempotencia: text("chave_idempotencia").notNull(),
    resultado: text("resultado").$type<"previa" | "gerado" | "bloqueado" | "falhou">().notNull(),
    nomeArquivo: text("nome_arquivo"),
    caminhoArquivo: text("caminho_arquivo"),
    diagnosticos: jsonb("diagnosticos")
      .$type<readonly string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    geradoPor: text("gerado_por").notNull(),
    geradoEm: timestamp("gerado_em", { withTimezone: true }).notNull().defaultNow(),
    motivoRegeracao: text("motivo_regeracao"),
    // Eventos variáveis: código do período de cálculo do Questor usado no arquivo (coluna 3 do NLI).
    codigoPeriodoCalculo: text("codigo_periodo_calculo"),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    foreignKey({
      columns: [table.empresaId],
      foreignColumns: [empresas.id],
      name: "questor_exportacoes_empresa_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.geradoPor],
      foreignColumns: [perfisUsuarios.usuarioId],
      name: "questor_exportacoes_gerado_por_fk"
    }).onDelete("restrict"),
    unique("questor_exportacoes_id_empresa_unico").on(table.id, table.empresaId),
    check(
      "questor_exportacoes_periodo_check",
      sql`${table.codigoPeriodoCalculo} is null or ${table.codigoPeriodoCalculo} ~ '^[0-9]{1,11}$'`
    ),
    unique("questor_exportacoes_idempotencia_unica").on(table.empresaId, table.tipo, table.chaveIdempotencia),
    check("questor_exportacoes_tipo_check", sql`${table.tipo} in ('admissao', 'eventos_variaveis')`),
    check(
      "questor_exportacoes_resultado_check",
      sql`${table.resultado} in ('previa', 'gerado', 'bloqueado', 'falhou')`
    ),
    check("questor_exportacoes_sha256_check", sql`${table.sha256} ~ '^[0-9a-f]{64}$'`),
    check("questor_exportacoes_layout_check", sql`length(btrim(${table.layoutVersao})) between 1 and 120`),
    index("questor_exportacoes_empresa_tipo_data_idx").on(table.empresaId, table.tipo, table.criadoEm)
  ]
);

export const questorExportacoesAdmissoes = pgTable(
  "questor_exportacoes_admissoes",
  {
    exportacaoId: uuid("exportacao_id").notNull(),
    processoId: uuid("processo_id").notNull(),
    empresaId: uuid("empresa_id").notNull()
  },
  (table) => [
    foreignKey({
      columns: [table.exportacaoId, table.empresaId],
      foreignColumns: [questorExportacoes.id, questorExportacoes.empresaId],
      name: "questor_exportacoes_admissoes_exportacao_empresa_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.processoId, table.empresaId],
      foreignColumns: [admissoesProcessos.id, admissoesProcessos.empresaId],
      name: "questor_exportacoes_admissoes_processo_empresa_fk"
    }).onDelete("restrict"),
    unique("questor_exportacoes_admissoes_exportacao_processo_unico").on(table.exportacaoId, table.processoId),
    index("questor_exportacoes_admissoes_empresa_processo_idx").on(table.empresaId, table.processoId)
  ]
);

export const questorEventosVariaveis = pgTable(
  "questor_eventos_variaveis",
  {
    id: idUuid,
    empresaId: uuid("empresa_id").notNull(),
    codigo: text("codigo").notNull(),
    descricao: text("descricao").notNull(),
    unidades: text("unidades").array().notNull(),
    ativo: boolean("ativo").notNull().default(true),
    // Dados do catálogo oficial da Conplus (eventos_variaveis_por_empresa.csv), quando importado.
    sequenciaQuestor: integer("sequencia_questor"),
    filialQuestor: integer("filial_questor"),
    natureza: text("natureza").$type<"Provento" | "Desconto">(),
    criadoPor: text("criado_por").notNull(),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    foreignKey({
      columns: [table.empresaId],
      foreignColumns: [empresas.id],
      name: "questor_eventos_variaveis_empresa_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.criadoPor],
      foreignColumns: [perfisUsuarios.usuarioId],
      name: "questor_eventos_variaveis_criado_por_fk"
    }).onDelete("restrict"),
    unique("questor_eventos_variaveis_id_empresa_unico").on(table.id, table.empresaId),
    unique("questor_eventos_variaveis_empresa_codigo_unico").on(table.empresaId, table.codigo),
    check("questor_eventos_variaveis_codigo_check", sql`${table.codigo} ~ '^[0-9]+$'`),
    check(
      "questor_eventos_variaveis_natureza_check",
      sql`${table.natureza} is null or ${table.natureza} in ('Provento', 'Desconto')`
    ),
    check(
      "questor_eventos_variaveis_catalogo_check",
      sql`(${table.sequenciaQuestor} is null or ${table.sequenciaQuestor} > 0) and (${table.filialQuestor} is null or ${table.filialQuestor} > 0)`
    ),
    check("questor_eventos_variaveis_descricao_check", sql`length(btrim(${table.descricao})) between 1 and 200`),
    check(
      "questor_eventos_variaveis_unidades_check",
      sql`cardinality(${table.unidades}) > 0 and ${table.unidades} <@ array['H','R','V']::text[]`
    ),
    index("questor_eventos_variaveis_empresa_ativo_idx").on(table.empresaId, table.ativo, table.codigo)
  ]
);

export const questorEventosVariaveisLancamentos = pgTable(
  "questor_eventos_variaveis_lancamentos",
  {
    id: idUuid,
    empresaId: uuid("empresa_id").notNull(),
    competencia: date("competencia").notNull(),
    vinculoId: uuid("vinculo_id").notNull(),
    eventoId: uuid("evento_id").notNull(),
    unidade: text("unidade").$type<"H" | "R" | "V">().notNull(),
    valor: numeric("valor", { precision: 18, scale: 4 }).notNull(),
    origem: text("origem").$type<"manual" | "importacao">().notNull().default("manual"),
    // Cancelamento lógico: lançamento que só saiu em arquivo TÉCNICO não some (o histórico aponta para
    // ele), mas deixa de valer e libera o mesmo evento para ser lançado de novo.
    canceladoEm: timestamp("cancelado_em", { withTimezone: true }),
    canceladoPor: text("cancelado_por"),
    motivoCancelamento: text("motivo_cancelamento"),
    criadoPor: text("criado_por").notNull(),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    foreignKey({
      columns: [table.vinculoId, table.empresaId],
      foreignColumns: [colaboradoresVinculos.id, colaboradoresVinculos.empresaId],
      name: "questor_eventos_variaveis_lancamentos_vinculo_empresa_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.eventoId, table.empresaId],
      foreignColumns: [questorEventosVariaveis.id, questorEventosVariaveis.empresaId],
      name: "questor_eventos_variaveis_lancamentos_evento_empresa_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.criadoPor],
      foreignColumns: [perfisUsuarios.usuarioId],
      name: "questor_eventos_variaveis_lancamentos_criado_por_fk"
    }).onDelete("restrict"),
    uniqueIndex("questor_eventos_variaveis_lancamentos_unico")
      .on(table.empresaId, table.competencia, table.vinculoId, table.eventoId)
      .where(sql`${table.canceladoEm} is null`),
    foreignKey({
      columns: [table.canceladoPor],
      foreignColumns: [perfisUsuarios.usuarioId],
      name: "questor_eventos_variaveis_lancamentos_cancelado_por_fk"
    }).onDelete("restrict"),
    check(
      "questor_eventos_variaveis_lancamentos_cancelamento_check",
      sql`(${table.canceladoEm} is null and ${table.canceladoPor} is null and ${table.motivoCancelamento} is null) or (${table.canceladoEm} is not null and ${table.canceladoPor} is not null and length(btrim(${table.motivoCancelamento})) between 5 and 500)`
    ),
    unique("questor_eventos_variaveis_lancamentos_id_empresa_unico").on(table.id, table.empresaId),
    check("questor_eventos_variaveis_lancamentos_unidade_check", sql`${table.unidade} in ('H', 'R', 'V')`),
    check("questor_eventos_variaveis_lancamentos_valor_check", sql`${table.valor} >= 0`),
    check("questor_eventos_variaveis_lancamentos_origem_check", sql`${table.origem} in ('manual', 'importacao')`),
    index("questor_eventos_variaveis_lancamentos_empresa_competencia_idx").on(table.empresaId, table.competencia)
  ]
);

export const questorExportacoesEventosVariaveis = pgTable(
  "questor_exportacoes_eventos_variaveis",
  {
    exportacaoId: uuid("exportacao_id").notNull(),
    lancamentoId: uuid("lancamento_id").notNull(),
    empresaId: uuid("empresa_id").notNull(),
    // Retrato da linha no arquivo OFICIAL: período, contrato e sequência formam, com a empresa, a chave
    // do Questor (Indice do EventoVariavel.nli). Nulos nos arquivos técnicos, que não são importados.
    codigoPeriodoCalculo: text("codigo_periodo_calculo"),
    codigoContrato: text("codigo_contrato"),
    sequencia: integer("sequencia")
  },
  (table) => [
    foreignKey({
      columns: [table.exportacaoId, table.empresaId],
      foreignColumns: [questorExportacoes.id, questorExportacoes.empresaId],
      name: "questor_exportacoes_eventos_exportacao_empresa_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.lancamentoId, table.empresaId],
      foreignColumns: [questorEventosVariaveisLancamentos.id, questorEventosVariaveisLancamentos.empresaId],
      name: "questor_exportacoes_eventos_lancamento_empresa_fk"
    }).onDelete("restrict"),
    unique("questor_exportacoes_eventos_exportacao_lancamento_unico").on(table.exportacaoId, table.lancamentoId),
    // A mesma chave do Questor nunca sai em dois arquivos oficiais: o Questor recusaria ou duplicaria.
    uniqueIndex("questor_exportacoes_eventos_chave_questor_unica")
      .on(table.empresaId, table.codigoPeriodoCalculo, table.codigoContrato, table.sequencia)
      .where(sql`${table.sequencia} is not null`),
    check(
      "questor_exportacoes_eventos_linha_check",
      sql`(${table.sequencia} is null and ${table.codigoPeriodoCalculo} is null and ${table.codigoContrato} is null) or (${table.sequencia} > 0 and ${table.codigoPeriodoCalculo} ~ '^[0-9]{1,11}$' and ${table.codigoContrato} ~ '^[0-9]{1,10}$')`
    ),
    index("questor_exportacoes_eventos_empresa_idx").on(table.empresaId, table.exportacaoId)
  ]
);

/**
 * Trilha de auditoria das ações Questor que não geram arquivo: downloads (inclusive do técnico, com a
 * confirmação do usuário), tentativas recusadas (homologação, catálogo de outra empresa) e
 * cancelamentos de lançamento. Só inserção; nada aqui é editado ou apagado.
 */
export const questorAuditoria = pgTable(
  "questor_auditoria",
  {
    id: idUuid,
    empresaId: uuid("empresa_id").notNull(),
    usuarioId: text("usuario_id").notNull(),
    acao: text("acao")
      .$type<"download" | "recusa_homologacao" | "recusa_catalogo" | "cancelamento_lancamento">()
      .notNull(),
    exportacaoId: uuid("exportacao_id"),
    detalhes: jsonb("detalhes")
      .$type<Record<string, string | number | boolean | null>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    criadoEm
  },
  (table) => [
    foreignKey({
      columns: [table.empresaId],
      foreignColumns: [empresas.id],
      name: "questor_auditoria_empresa_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.usuarioId],
      foreignColumns: [perfisUsuarios.usuarioId],
      name: "questor_auditoria_usuario_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.exportacaoId, table.empresaId],
      foreignColumns: [questorExportacoes.id, questorExportacoes.empresaId],
      name: "questor_auditoria_exportacao_fk"
    }).onDelete("restrict"),
    check(
      "questor_auditoria_acao_check",
      sql`${table.acao} in ('download', 'recusa_homologacao', 'recusa_catalogo', 'cancelamento_lancamento')`
    ),
    index("questor_auditoria_empresa_data_idx").on(table.empresaId, table.criadoEm)
  ]
);
