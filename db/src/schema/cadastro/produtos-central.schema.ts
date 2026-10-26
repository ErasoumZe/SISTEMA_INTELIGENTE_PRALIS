import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";
import type { JsonValue } from "@padaria/shared/api";
import { perfisUsuarios } from "../app.schema.js";

const idUuid = (nome = "id") =>
  uuid(nome)
    .primaryKey()
    .default(sql`uuid_generate_v7()`);

/** Uma importação isolada de fontes; somente uma carga validada poderá ser ativada. */
export const produtosCentralCargas = pgTable(
  "produtos_central_cargas",
  {
    id: idUuid(),
    estado: text("estado").notNull().default("recebida"),
    manifesto: jsonb("manifesto").$type<Record<string, JsonValue>>().notNull(),
    resumo: jsonb("resumo").$type<Record<string, JsonValue>>(),
    criadoPor: text("criado_por").references(() => perfisUsuarios.usuarioId, { onDelete: "set null" }),
    criadoPorNome: text("criado_por_nome"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    validadoEm: timestamp("validado_em", { withTimezone: true }),
    ativadoEm: timestamp("ativado_em", { withTimezone: true })
  },
  (t) => [
    check(
      "produtos_central_cargas_estado_check",
      sql`${t.estado} in ('recebida', 'validando', 'validada', 'ativa', 'substituida', 'falhou')`
    ),
    index("produtos_central_cargas_estado_data_idx").on(t.estado, t.criadoEm)
  ]
);

/** Linhas de origem imutáveis da carga; não são registros do catálogo de produtos. */
export const produtosCentralFontes = pgTable(
  "produtos_central_fontes",
  {
    id: idUuid(),
    cargaId: uuid("carga_id").notNull(),
    fonte: text("fonte").notNull(),
    lojaFonte: text("loja_fonte").notNull(),
    chaveLinhaFonte: text("chave_linha_fonte").notNull(),
    idSistema: text("id_sistema"),
    codigoInterno: text("codigo_interno").notNull().default(""),
    codigoBarras: text("codigo_barras").notNull().default(""),
    chaveBarras: text("chave_barras").notNull().default(""),
    nome: text("nome").notNull().default(""),
    nomeNormalizado: text("nome_normalizado").notNull().default(""),
    ativo: boolean("ativo"),
    grupo: text("grupo"),
    custo: text("custo"),
    venda: text("venda"),
    fiscal: jsonb("fiscal").$type<Record<string, JsonValue> | null>(),
    dadosOriginais: jsonb("dados_originais").$type<Record<string, JsonValue>>().notNull(),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    foreignKey({ columns: [t.cargaId], foreignColumns: [produtosCentralCargas.id] }).onDelete("cascade"),
    uniqueIndex("produtos_central_fontes_carga_fonte_chave_unico").on(t.cargaId, t.fonte, t.chaveLinhaFonte),
    uniqueIndex("produtos_central_fontes_id_carga_unico").on(t.id, t.cargaId),
    check(
      "produtos_central_fontes_fonte_check",
      sql`${t.fonte} in ('sia_li', 'compilart_tnp', 'planilha_tnp', 'fiscal_tnp', 'planilha_nova', 'vendidos_tnp', 'pralis', 'vendas_pdv_12m')`
    ),
    check("produtos_central_fontes_loja_check", sql`${t.lojaFonte} in ('LI', 'TNP', 'BASE', 'HORA')`),
    index("produtos_central_fontes_carga_barras_idx").on(t.cargaId, t.chaveBarras),
    index("produtos_central_fontes_carga_nome_idx").on(t.cargaId, t.nomeNormalizado),
    index("produtos_central_fontes_carga_loja_interno_idx").on(t.cargaId, t.lojaFonte, t.codigoInterno)
  ]
);

/** Snapshot recalculável dos grupos; decisão/auditoria não vive nesta tabela. */
export const produtosCentralGrupos = pgTable(
  "produtos_central_grupos",
  {
    id: idUuid(),
    cargaId: uuid("carga_id").notNull(),
    chave: text("chave").notNull(),
    motivo: text("motivo").notNull(),
    fontes: text("fontes").array().notNull(),
    lojas: text("lojas").array().notNull(),
    candidato: jsonb("candidato").$type<Record<string, JsonValue>>().notNull(),
    nome: text("nome").notNull().default(""),
    nomeNormalizado: text("nome_normalizado").notNull().default(""),
    ativo: boolean("ativo").notNull().default(false),
    alertaNomeDivergente: boolean("alerta_nome_divergente").notNull().default(false),
    alertaBarrasConflitantes: boolean("alerta_barras_conflitantes").notNull().default(false),
    alertaSemBarras: boolean("alerta_sem_barras").notNull().default(false),
    alertaSemFiscalTnp: boolean("alerta_sem_fiscal_tnp").notNull().default(false),
    alertaSemGrupo: boolean("alerta_sem_grupo").notNull().default(false),
    alertaJaNaBase: boolean("alerta_ja_na_base").notNull().default(false),
    calculadoEm: timestamp("calculado_em", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    foreignKey({ columns: [t.cargaId], foreignColumns: [produtosCentralCargas.id] }).onDelete("cascade"),
    uniqueIndex("produtos_central_grupos_carga_chave_unico").on(t.cargaId, t.chave),
    uniqueIndex("produtos_central_grupos_id_carga_unico").on(t.id, t.cargaId),
    check(
      "produtos_central_grupos_motivo_check",
      sql`${t.motivo} in ('mesmo_id_sistema', 'mesmo_cod_barras', 'mesmo_cod_interno', 'nome_parecido', 'unico')`
    ),
    index("produtos_central_grupos_carga_motivo_idx").on(t.cargaId, t.motivo),
    index("produtos_central_grupos_carga_nome_idx").on(t.cargaId, t.nomeNormalizado)
  ]
);

/** Liga cada grupo às linhas de origem, preservadas para comparação e auditoria. */
export const produtosCentralGruposFontes = pgTable(
  "produtos_central_grupos_fontes",
  {
    id: idUuid(),
    cargaId: uuid("carga_id").notNull(),
    grupoId: uuid("grupo_id").notNull(),
    fonteProdutoId: uuid("fonte_produto_id").notNull(),
    fonte: text("fonte").notNull(),
    lojaFonte: text("loja_fonte").notNull()
  },
  (t) => [
    foreignKey({
      columns: [t.grupoId, t.cargaId],
      foreignColumns: [produtosCentralGrupos.id, produtosCentralGrupos.cargaId]
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.fonteProdutoId, t.cargaId],
      foreignColumns: [produtosCentralFontes.id, produtosCentralFontes.cargaId]
    }).onDelete("cascade"),
    uniqueIndex("produtos_central_grupo_fonte_unico").on(t.grupoId, t.fonteProdutoId),
    check("produtos_central_grupos_fontes_loja_check", sql`${t.lojaFonte} in ('LI', 'TNP', 'BASE', 'HORA')`),
    index("produtos_central_grupos_fontes_carga_loja_idx").on(t.cargaId, t.lojaFonte, t.grupoId)
  ]
);

/** Trilha append-only de decisões; sobrevive à substituição ou recálculo das cargas. */
export const produtosCentralDecisoes = pgTable(
  "produtos_central_decisoes",
  {
    id: idUuid(),
    chaveGrupo: text("chave_grupo").notNull(),
    acao: text("acao").notNull(),
    produtoId: uuid("produto_id"),
    detalhe: jsonb("detalhe").$type<Record<string, JsonValue>>().notNull(),
    usuarioId: text("usuario_id").references(() => perfisUsuarios.usuarioId, { onDelete: "set null" }),
    usuarioNome: text("usuario_nome"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    check(
      "produtos_central_decisoes_acao_check",
      sql`${t.acao} in ('unificado', 'criado', 'nao_e_o_mesmo', 'ignorado')`
    ),
    index("produtos_central_decisoes_chave_data_idx").on(t.chaveGrupo, t.criadoEm),
    index("produtos_central_decisoes_produto_idx").on(t.produtoId)
  ]
);
