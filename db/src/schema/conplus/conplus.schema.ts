import { sql } from "drizzle-orm";
import type { JsonValue } from "@padaria/shared/api";
import {
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
import { empresas, perfisUsuarios } from "../app.schema.js";

const criadoEm = timestamp("criado_em", { withTimezone: true }).notNull().defaultNow();
const atualizadoEm = timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow();
const idUuid = uuid("id")
  .primaryKey()
  .default(sql`uuid_generate_v7()`);

export const conplusImportacoes = pgTable(
  "conplus_importacoes",
  {
    id: idUuid,
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "restrict" }),
    tipo: text("tipo").$type<"folha_05" | "adiantamento_20" | "rescisoes" | "ferias">().notNull(),
    competencia: date("competencia").notNull(),
    // De onde veio o conteúdo: upload manual do DP ou busca automática pela API Conplus (quando
    // liberada). Linhas antigas são todas de arquivo — daí o default.
    origem: text("origem").$type<"arquivo" | "api">().notNull().default("arquivo"),
    nomeArquivo: text("nome_arquivo").notNull(),
    hashArquivo: text("hash_arquivo").notNull(),
    tamanhoBytes: integer("tamanho_bytes").notNull(),
    totalRegistros: integer("total_registros").notNull().default(0),
    status: text("status").$type<"previa" | "confirmada" | "retificada" | "falhou">().notNull().default("previa"),
    dadosPrevia: jsonb("dados_previa").$type<Record<string, JsonValue>>(),
    sincronizacaoStatus: text("sincronizacao_status")
      .$type<"nao_iniciada" | "pendente" | "processando" | "concluida" | "falhou">()
      .notNull()
      .default("nao_iniciada"),
    ultimoErroCodigo: text("ultimo_erro_codigo"),
    ultimoErroMensagem: text("ultimo_erro_mensagem"),
    criadoPor: text("criado_por")
      .notNull()
      .references(() => perfisUsuarios.usuarioId, { onDelete: "restrict" }),
    confirmadoPor: text("confirmado_por").references(() => perfisUsuarios.usuarioId, { onDelete: "set null" }),
    confirmadoEm: timestamp("confirmado_em", { withTimezone: true }),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    unique("conplus_importacoes_empresa_hash_unico").on(table.empresaId, table.hashArquivo),
    unique("conplus_importacoes_id_empresa_unico").on(table.id, table.empresaId),
    check(
      "conplus_importacoes_tipo_check",
      sql`${table.tipo} in ('folha_05', 'adiantamento_20', 'rescisoes', 'ferias')`
    ),
    check("conplus_importacoes_status_check", sql`${table.status} in ('previa', 'confirmada', 'retificada', 'falhou')`),
    check("conplus_importacoes_origem_check", sql`${table.origem} in ('arquivo', 'api')`),
    check(
      "conplus_importacoes_sincronizacao_status_check",
      sql`${table.sincronizacaoStatus} in ('nao_iniciada', 'pendente', 'processando', 'concluida', 'falhou')`
    ),
    check("conplus_importacoes_tamanho_check", sql`${table.tamanhoBytes} >= 0`),
    check("conplus_importacoes_total_check", sql`${table.totalRegistros} >= 0`),
    index("conplus_importacoes_empresa_competencia_idx").on(table.empresaId, table.competencia, table.tipo)
  ]
);

export const conplusRegistros = pgTable(
  "conplus_registros",
  {
    id: idUuid,
    importacaoId: uuid("importacao_id").notNull(),
    empresaId: uuid("empresa_id").notNull(),
    tipo: text("tipo").$type<"folha_05" | "adiantamento_20" | "rescisoes" | "ferias">().notNull(),
    competencia: date("competencia").notNull(),
    identificadorExterno: text("identificador_externo").notNull(),
    codigoColaborador: text("codigo_colaborador"),
    nomeColaborador: text("nome_colaborador"),
    dados: jsonb("dados").$type<Record<string, JsonValue>>().notNull(),
    status: text("status").$type<"ativo" | "retificado">().notNull().default("ativo"),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    foreignKey({
      columns: [table.importacaoId, table.empresaId],
      foreignColumns: [conplusImportacoes.id, conplusImportacoes.empresaId],
      name: "conplus_registros_importacao_empresa_fk"
    }).onDelete("restrict"),
    unique("conplus_registros_importacao_identificador_unico").on(table.importacaoId, table.identificadorExterno),
    unique("conplus_registros_id_importacao_empresa_unico").on(table.id, table.importacaoId, table.empresaId),
    check("conplus_registros_status_check", sql`${table.status} in ('ativo', 'retificado')`),
    index("conplus_registros_empresa_competencia_idx").on(table.empresaId, table.competencia, table.tipo),
    index("conplus_registros_empresa_colaborador_idx").on(table.empresaId, table.nomeColaborador)
  ]
);

export const conplusEventos = pgTable(
  "conplus_eventos",
  {
    id: idUuid,
    registroId: uuid("registro_id").notNull(),
    importacaoId: uuid("importacao_id").notNull(),
    empresaId: uuid("empresa_id").notNull(),
    ordem: integer("ordem").notNull(),
    codigo: text("codigo").notNull(),
    unidade: text("unidade").$type<"H" | "R" | "V" | null>(),
    natureza: text("natureza"),
    referencia: text("referencia"),
    valor: numeric("valor", { precision: 18, scale: 4 }),
    dados: jsonb("dados")
      .$type<Record<string, JsonValue>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    criadoEm
  },
  (table) => [
    foreignKey({
      columns: [table.registroId, table.importacaoId, table.empresaId],
      foreignColumns: [conplusRegistros.id, conplusRegistros.importacaoId, conplusRegistros.empresaId],
      name: "conplus_eventos_registro_importacao_empresa_fk"
    }).onDelete("cascade"),
    unique("conplus_eventos_registro_ordem_unico").on(table.registroId, table.ordem),
    check("conplus_eventos_unidade_check", sql`${table.unidade} is null or ${table.unidade} in ('H', 'R', 'V')`),
    check("conplus_eventos_ordem_check", sql`${table.ordem} >= 0`),
    index("conplus_eventos_importacao_idx").on(table.importacaoId, table.empresaId, table.codigo)
  ]
);

export const conplusImportacoesHistorico = pgTable(
  "conplus_importacoes_historico",
  {
    id: idUuid,
    importacaoId: uuid("importacao_id").notNull(),
    empresaId: uuid("empresa_id").notNull(),
    acao: text("acao")
      .$type<"confirmada" | "retificada" | "sincronizacao_iniciada" | "sincronizacao_concluida" | "falha">()
      .notNull(),
    statusAnterior: text("status_anterior"),
    statusNovo: text("status_novo"),
    detalhes: jsonb("detalhes")
      .$type<Record<string, JsonValue>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    atorUsuarioId: text("ator_usuario_id").references(() => perfisUsuarios.usuarioId, { onDelete: "set null" }),
    criadoEm
  },
  (table) => [
    foreignKey({
      columns: [table.importacaoId, table.empresaId],
      foreignColumns: [conplusImportacoes.id, conplusImportacoes.empresaId],
      name: "conplus_historico_importacao_empresa_fk"
    }).onDelete("restrict"),
    index("conplus_historico_importacao_idx").on(table.importacaoId, table.criadoEm)
  ]
);

export const conplusGoogleSincronizacoes = pgTable(
  "conplus_google_sincronizacoes",
  {
    id: idUuid,
    importacaoId: uuid("importacao_id").notNull(),
    empresaId: uuid("empresa_id").notNull(),
    aba: text("aba").notNull(),
    status: text("status").$type<"pendente" | "processando" | "concluida" | "falhou">().notNull().default("pendente"),
    linhaInicial: integer("linha_inicial"),
    linhasInseridas: integer("linhas_inseridas").notNull().default(0),
    tentativa: integer("tentativa").notNull().default(0),
    bloqueioToken: text("bloqueio_token"),
    bloqueioAte: timestamp("bloqueio_ate", { withTimezone: true }),
    ultimoErroCodigo: text("ultimo_erro_codigo"),
    ultimoErroMensagem: text("ultimo_erro_mensagem"),
    iniciadoEm: timestamp("iniciado_em", { withTimezone: true }),
    concluidoEm: timestamp("concluido_em", { withTimezone: true }),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    foreignKey({
      columns: [table.importacaoId, table.empresaId],
      foreignColumns: [conplusImportacoes.id, conplusImportacoes.empresaId],
      name: "conplus_google_importacao_empresa_fk"
    }).onDelete("restrict"),
    unique("conplus_google_importacao_aba_unica").on(table.importacaoId, table.aba),
    uniqueIndex("conplus_google_bloqueio_unico")
      .on(table.bloqueioToken)
      .where(sql`${table.bloqueioToken} is not null`),
    check("conplus_google_status_check", sql`${table.status} in ('pendente', 'processando', 'concluida', 'falhou')`),
    check("conplus_google_tentativa_check", sql`${table.tentativa} >= 0`),
    check("conplus_google_linhas_check", sql`${table.linhasInseridas} >= 0`),
    index("conplus_google_fila_idx").on(table.status, table.bloqueioAte, table.criadoEm)
  ]
);

/**
 * Estado da busca automática na API Conplus — uma linha por empresa e tipo de relatório.
 *
 * Existe antes da API para que a rotina, quando liberada, só precise preencher: até onde já buscou
 * (competência + cursor opaco devolvido pela API), quem está executando agora (bloqueio com prazo,
 * para duas instâncias não buscarem a mesma coisa), quantas falhas seguidas e quando tentar de novo.
 * O conteúdo buscado continua entrando por `conplus_importacoes` (origem = 'api'), com a mesma prévia,
 * confirmação e idempotência por hash do upload manual.
 */
export const conplusSincronizacaoEstado = pgTable(
  "conplus_sincronizacao_estado",
  {
    id: idUuid,
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "restrict" }),
    tipo: text("tipo").$type<"folha_05" | "adiantamento_20" | "rescisoes" | "ferias">().notNull(),
    status: text("status").$type<"ociosa" | "executando" | "falhou">().notNull().default("ociosa"),
    ultimaCompetencia: date("ultima_competencia"),
    cursor: text("cursor"),
    tentativas: integer("tentativas").notNull().default(0),
    proximaTentativaEm: timestamp("proxima_tentativa_em", { withTimezone: true }),
    bloqueioToken: text("bloqueio_token"),
    bloqueioAte: timestamp("bloqueio_ate", { withTimezone: true }),
    ultimaExecucaoEm: timestamp("ultima_execucao_em", { withTimezone: true }),
    ultimoSucessoEm: timestamp("ultimo_sucesso_em", { withTimezone: true }),
    ultimaImportacaoId: uuid("ultima_importacao_id"),
    ultimoErroCodigo: text("ultimo_erro_codigo"),
    ultimoErroMensagem: text("ultimo_erro_mensagem"),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    foreignKey({
      columns: [table.ultimaImportacaoId, table.empresaId],
      foreignColumns: [conplusImportacoes.id, conplusImportacoes.empresaId],
      name: "conplus_sincronizacao_estado_importacao_fk"
    }).onDelete("restrict"),
    unique("conplus_sincronizacao_estado_empresa_tipo_unico").on(table.empresaId, table.tipo),
    uniqueIndex("conplus_sincronizacao_estado_bloqueio_unico")
      .on(table.bloqueioToken)
      .where(sql`${table.bloqueioToken} is not null`),
    check(
      "conplus_sincronizacao_estado_tipo_check",
      sql`${table.tipo} in ('folha_05', 'adiantamento_20', 'rescisoes', 'ferias')`
    ),
    check("conplus_sincronizacao_estado_status_check", sql`${table.status} in ('ociosa', 'executando', 'falhou')`),
    check("conplus_sincronizacao_estado_tentativas_check", sql`${table.tentativas} >= 0`),
    // Executando sem dono (ou dono sem prazo) seria uma trava que ninguém solta.
    check(
      "conplus_sincronizacao_estado_bloqueio_check",
      sql`(${table.status} = 'executando') = (${table.bloqueioToken} is not null and ${table.bloqueioAte} is not null)`
    ),
    check(
      "conplus_sincronizacao_estado_cursor_check",
      sql`${table.cursor} is null or length(${table.cursor}) between 1 and 2000`
    )
  ]
);
