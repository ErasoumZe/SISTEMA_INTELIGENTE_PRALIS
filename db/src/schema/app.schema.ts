import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn
} from "drizzle-orm/pg-core";
import type { Permissao, TipoMovimentacao } from "@padaria/shared";

const criadoEm = timestamp("criado_em", { withTimezone: true }).notNull().defaultNow();
const atualizadoEm = timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow();
const idUuid = uuid("id").primaryKey().default(sql`uuid_generate_v7()`);
const empresaId = uuid("empresa_id")
  .notNull()
  .references(() => empresas.id, { onDelete: "cascade" });
const valorMonetario = (nome: string) => numeric(nome, { precision: 14, scale: 2 });

export const empresas = pgTable("empresas", {
  id: idUuid,
  nome: text("nome").notNull(),
  criadoEm
});

export const perfisUsuarios = pgTable(
  "perfis_usuarios",
  {
    usuarioId: text("usuario_id").primaryKey(),
    empresaId: uuid("empresa_id").references(() => empresas.id, { onDelete: "set null" }),
    nome: text("nome").notNull(),
    email: text("email").notNull().unique(),
    role: text("role").$type<"usuario_comum" | "usuario_admin" | "admin">().notNull().default("usuario_comum"),
    criadoEm,
    atualizadoEm
  },
  (table) => [check("perfis_usuarios_role_check", sql`${table.role} in ('usuario_comum', 'usuario_admin', 'admin')`)]
);

export const permissoesTabela = pgTable("permissoes", {
  codigo: text("codigo").$type<Permissao>().primaryKey(),
  nome: text("nome").notNull(),
  descricao: text("descricao").notNull().default("")
});

export const permissoesUsuarios = pgTable(
  "permissoes_usuarios",
  {
    usuarioId: text("usuario_id")
      .notNull()
      .references(() => perfisUsuarios.usuarioId, { onDelete: "cascade" }),
    permissaoCodigo: text("permissao_codigo")
      .$type<Permissao>()
      .notNull()
      .references(() => permissoesTabela.codigo, { onDelete: "cascade" })
  },
  (table) => [primaryKey({ columns: [table.usuarioId, table.permissaoCodigo] })]
);

export const usuariosEmpresas = pgTable(
  "usuarios_empresas",
  {
    usuarioId: text("usuario_id")
      .notNull()
      .references(() => perfisUsuarios.usuarioId, { onDelete: "cascade" }),
    empresaId,
    criadoEm
  },
  (table) => [primaryKey({ columns: [table.usuarioId, table.empresaId] })]
);

export const configuracoesTema = pgTable(
  "configuracoes_tema",
  {
    id: boolean("id").primaryKey().default(true),
    corPrimaria: text("cor_primaria").notNull().default("#6d28d9"),
    corSecundaria: text("cor_secundaria").notNull().default("#0891b2"),
    corFundo: text("cor_fundo").notNull().default("#eaf1f9"),
    corCartao: text("cor_cartao").notNull().default("#ffffff"),
    corSucesso: text("cor_sucesso").notNull().default("#16a34a"),
    corAviso: text("cor_aviso").notNull().default("#f59e0b"),
    corErro: text("cor_erro").notNull().default("#ef4444"),
    atualizadoPor: text("atualizado_por"),
    atualizadoEm
  },
  (table) => [check("configuracoes_tema_unica", sql`${table.id}`)]
);

export const configuracoesTemasTelas = pgTable(
  "configuracoes_temas_telas",
  {
    empresaId,
    tela: text("tela").notNull(),
    corPrimaria: text("cor_primaria").notNull().default("#6d28d9"),
    corSecundaria: text("cor_secundaria").notNull().default("#0891b2"),
    corFundo: text("cor_fundo").notNull().default("#eaf1f9"),
    corCartao: text("cor_cartao").notNull().default("#ffffff"),
    corSucesso: text("cor_sucesso").notNull().default("#16a34a"),
    corAviso: text("cor_aviso").notNull().default("#f59e0b"),
    corErro: text("cor_erro").notNull().default("#ef4444"),
    atualizadoPor: text("atualizado_por"),
    atualizadoEm
  },
  (table) => [primaryKey({ columns: [table.empresaId, table.tela] })]
);

export const contas = pgTable("contas", {
  id: idUuid,
  empresaId,
  nome: text("nome").notNull(),
  ativa: boolean("ativa").notNull().default(true),
  criadoEm,
  importadoDe: uuid("importado_de").references(() => empresas.id, { onDelete: "set null" }),
  idImportado: uuid("id_importado")
});

export const fornecedores = pgTable("fornecedores", {
  id: idUuid,
  empresaId,
  nome: text("nome").notNull(),
  documento: text("documento"),
  criadoEm,
  importadoDe: uuid("importado_de").references(() => empresas.id, { onDelete: "set null" }),
  idImportado: uuid("id_importado")
});

export const areas = pgTable("areas", {
  id: idUuid,
  empresaId,
  nome: text("nome").notNull(),
  criadoEm,
  importadoDe: uuid("importado_de").references(() => empresas.id, { onDelete: "set null" }),
  idImportado: uuid("id_importado")
});

export const setores = pgTable("setores", {
  id: idUuid,
  empresaId,
  areaId: uuid("area_id").references(() => areas.id),
  setorPaiId: uuid("setor_pai_id").references((): AnyPgColumn => setores.id),
  nome: text("nome").notNull(),
  criadoEm,
  importadoDe: uuid("importado_de").references(() => empresas.id, { onDelete: "set null" }),
  idImportado: uuid("id_importado")
});

export const colaboradores = pgTable(
  "colaboradores",
  {
    id: idUuid,
    empresaId,
    nome: text("nome").notNull(),
    cpf: text("cpf"),
    setorId: uuid("setor_id").references(() => setores.id),
    usuarioId: text("usuario_id").references(() => perfisUsuarios.usuarioId, { onDelete: "set null" }),
    criadoEm,
    importadoDe: uuid("importado_de").references(() => empresas.id, { onDelete: "set null" }),
    idImportado: uuid("id_importado")
  },
  (table) => [
    uniqueIndex("colaboradores_usuario_id_unico")
      .on(table.usuarioId)
      .where(sql`${table.usuarioId} is not null`)
  ]
);

export const cargos = pgTable(
  "cargos",
  {
    id: idUuid,
    empresaId,
    nome: text("nome").notNull(),
    criadoEm,
    atualizadoEm,
    importadoDe: uuid("importado_de").references(() => empresas.id, { onDelete: "set null" }),
    idImportado: uuid("id_importado")
  },
  (table) => [unique("cargos_empresa_nome_unica").on(table.empresaId, table.nome)]
);

export const permissoesCargos = pgTable(
  "permissoes_cargos",
  {
    cargoId: uuid("cargo_id")
      .notNull()
      .references(() => cargos.id, { onDelete: "cascade" }),
    permissaoCodigo: text("permissao_codigo")
      .$type<Permissao>()
      .notNull()
      .references(() => permissoesTabela.codigo, { onDelete: "cascade" })
  },
  (table) => [primaryKey({ columns: [table.cargoId, table.permissaoCodigo] })]
);

export const gruposDespesas = pgTable("grupos_despesas", {
  id: idUuid,
  empresaId,
  nome: text("nome").notNull(),
  grupoPaiId: uuid("grupo_pai_id").references((): AnyPgColumn => gruposDespesas.id),
  criadoEm,
  importadoDe: uuid("importado_de").references(() => empresas.id, { onDelete: "set null" }),
  idImportado: uuid("id_importado")
});

export const gruposMercadorias = pgTable("grupos_mercadorias", {
  id: idUuid,
  empresaId,
  nome: text("nome").notNull(),
  grupoPaiId: uuid("grupo_pai_id").references((): AnyPgColumn => gruposMercadorias.id),
  criadoEm,
  importadoDe: uuid("importado_de").references(() => empresas.id, { onDelete: "set null" }),
  idImportado: uuid("id_importado")
});

export const gruposRetiradas = pgTable("grupos_retiradas", {
  id: idUuid,
  empresaId,
  nome: text("nome").notNull(),
  grupoPaiId: uuid("grupo_pai_id").references((): AnyPgColumn => gruposRetiradas.id),
  criadoEm,
  importadoDe: uuid("importado_de").references(() => empresas.id, { onDelete: "set null" }),
  idImportado: uuid("id_importado")
});

export const unidadesMedida = pgTable("unidades_medida", {
  id: idUuid,
  empresaId,
  nome: text("nome").notNull(),
  sigla: text("sigla").notNull(),
  criadoEm,
  importadoDe: uuid("importado_de").references(() => empresas.id, { onDelete: "set null" }),
  idImportado: uuid("id_importado")
});

export const colaboradoresCargos = pgTable(
  "colaboradores_cargos",
  {
    id: idUuid,
    empresaId,
    colaboradorId: uuid("colaborador_id")
      .notNull()
      .references(() => colaboradores.id, { onDelete: "cascade" }),
    setorId: uuid("setor_id").references(() => setores.id),
    cargoId: uuid("cargo_id")
      .notNull()
      .references(() => cargos.id),
    remuneracaoMinuto: numeric("remuneracao_minuto", { precision: 14, scale: 6 }).notNull(),
    dataInicio: date("data_inicio").notNull(),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm,
    atualizadoEm,
    importadoDe: uuid("importado_de").references(() => empresas.id, { onDelete: "set null" }),
    idImportado: uuid("id_importado")
  },
  (table) => [
    unique("colaboradores_cargos_empresa_colaborador_cargo_data_unica").on(
      table.empresaId,
      table.colaboradorId,
      table.cargoId,
      table.dataInicio
    ),
    check("colaboradores_cargos_remuneracao_minuto_check", sql`${table.remuneracaoMinuto} > 0`)
  ]
);

export const colaboradoresJornadas = pgTable(
  "colaboradores_jornadas",
  {
    id: idUuid,
    empresaId,
    colaboradorId: uuid("colaborador_id")
      .notNull()
      .references(() => colaboradores.id, { onDelete: "cascade" }),
    diaDaSemana: text("dia_da_semana").notNull(),
    cargaHorariaDiariaEmMinutos: integer("carga_horaria_diaria_em_minutos").notNull(),
    intervaloMinutos: integer("intervalo_minutos").notNull().default(0),
    colaboradorCargoId: uuid("colaborador_cargo_id").references(() => colaboradoresCargos.id),
    horaEntrada: time("hora_entrada"),
    dataInicio: date("data_inicio").notNull(),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm,
    atualizadoEm,
    importadoDe: uuid("importado_de").references(() => empresas.id, { onDelete: "set null" }),
    idImportado: uuid("id_importado")
  },
  (table) => [
    check(
      "colaboradores_jornadas_dia_da_semana_check",
      sql`${table.diaDaSemana} in ('SEGUNDA', 'TERCA', 'QUARTA', 'QUINTA', 'SEXTA', 'SABADO', 'DOMINGO')`
    ),
    check("colaboradores_jornadas_carga_check", sql`${table.cargaHorariaDiariaEmMinutos} >= 0`),
    check("colaboradores_jornadas_intervalo_check", sql`${table.intervaloMinutos} >= 0`)
  ]
);

export const colaboradoresFaltasJustificadas = pgTable(
  "colaboradores_faltas_justificadas",
  {
    id: idUuid,
    empresaId,
    colaboradorId: uuid("colaborador_id")
      .notNull()
      .references(() => colaboradores.id, { onDelete: "cascade" }),
    inicio: timestamp("inicio", { withTimezone: true }).notNull(),
    fim: timestamp("fim", { withTimezone: true }).notNull(),
    motivo: text("motivo").notNull(),
    criadoEm,
    atualizadoEm,
    importadoDe: uuid("importado_de").references(() => empresas.id, { onDelete: "set null" }),
    idImportado: uuid("id_importado")
  },
  (table) => [check("colaboradores_faltas_justificadas_fim_check", sql`${table.fim} > ${table.inicio}`)]
);

export const feriados = pgTable(
  "feriados",
  {
    id: idUuid,
    empresaId,
    nome: text("nome").notNull(),
    dia: integer("dia").notNull(),
    mes: integer("mes").notNull(),
    ano: integer("ano"),
    criadoEm,
    atualizadoEm,
    importadoDe: uuid("importado_de").references(() => empresas.id, { onDelete: "set null" }),
    idImportado: uuid("id_importado")
  },
  (table) => [
    check("feriados_dia_check", sql`${table.dia} between 1 and 31`),
    check("feriados_mes_check", sql`${table.mes} between 1 and 12`),
    check("feriados_ano_check", sql`${table.ano} between 1900 and 9999`),
    uniqueIndex("feriados_empresa_data_unica_idx").on(
      table.empresaId,
      table.dia,
      table.mes,
      sql`coalesce(${table.ano}, 0)`,
      sql`lower(${table.nome})`
    )
  ]
);

export const permissoesSetores = pgTable(
  "permissoes_setores",
  {
    setorId: uuid("setor_id")
      .notNull()
      .references(() => setores.id, { onDelete: "cascade" }),
    permissaoCodigo: text("permissao_codigo")
      .$type<Permissao>()
      .notNull()
      .references(() => permissoesTabela.codigo, { onDelete: "cascade" })
  },
  (table) => [primaryKey({ columns: [table.setorId, table.permissaoCodigo] })]
);

export const produtos = pgTable("produtos", {
  id: idUuid,
  empresaId,
  grupoMercadoriaId: uuid("grupo_mercadoria_id").references(() => gruposMercadorias.id),
  unidadeMedidaId: uuid("unidade_medida_id").references(() => unidadesMedida.id),
  codigo: text("codigo"),
  codigoBarras: text("codigo_barras"),
  descricao: text("descricao").notNull(),
  criadoEm,
  importadoDe: uuid("importado_de").references(() => empresas.id, { onDelete: "set null" }),
  idImportado: uuid("id_importado")
});

export const malotes = pgTable(
  "malotes",
  {
    id: idUuid,
    empresaId,
    codigo: text("codigo").notNull(),
    descricao: text("descricao"),
    criadoPor: text("criado_por"),
    criadoEm,
    importadoDe: uuid("importado_de").references(() => empresas.id, { onDelete: "set null" }),
    idImportado: uuid("id_importado")
  },
  (table) => [unique("malotes_empresa_id_codigo_key").on(table.empresaId, table.codigo)]
);

export const lacresMalotes = pgTable(
  "lacres_malotes",
  {
    id: idUuid,
    empresaId,
    maloteId: uuid("malote_id")
      .notNull()
      .references(() => malotes.id, { onDelete: "cascade" }),
    numero: text("numero").notNull(),
    status: text("status").notNull().default("disponivel"),
    usadoEm: timestamp("usado_em", { withTimezone: true })
  },
  (table) => [
    unique("lacres_malotes_malote_id_numero_key").on(table.maloteId, table.numero),
    uniqueIndex("lacres_malotes_empresa_numero_unico_idx").on(table.empresaId, sql`lower(${table.numero})`),
    check("lacres_malotes_status_check", sql`${table.status} in ('disponivel', 'usado', 'cancelado')`)
  ]
);

export const movimentacoesFinanceiras = pgTable(
  "movimentacoes_financeiras",
  {
    id: idUuid,
    empresaId,
    tipo: text("tipo").$type<TipoMovimentacao>().notNull(),
    dataReferencia: date("data_referencia").notNull(),
    dataVencimento: date("data_vencimento"),
    dataPagamento: date("data_pagamento"),
    descricao: text("descricao").notNull(),
    observacao: text("observacao"),
    valorOriginal: valorMonetario("valor_original").notNull(),
    valorAcrescimo: valorMonetario("valor_acrescimo").notNull().default("0"),
    descricaoAcrescimo: text("descricao_acrescimo"),
    valorDesconto: valorMonetario("valor_desconto").notNull().default("0"),
    descricaoDesconto: text("descricao_desconto"),
    contaOrigemId: uuid("conta_origem_id").references(() => contas.id),
    contaDestinoId: uuid("conta_destino_id").references(() => contas.id),
    fornecedorId: uuid("fornecedor_id").references(() => fornecedores.id),
    colaboradorId: uuid("colaborador_id").references(() => colaboradores.id),
    grupoDespesaId: uuid("grupo_despesa_id").references(() => gruposDespesas.id),
    grupoMercadoriaId: uuid("grupo_mercadoria_id").references(() => gruposMercadorias.id),
    grupoRetiradaId: uuid("grupo_retirada_id").references(() => gruposRetiradas.id),
    maloteId: uuid("malote_id").references(() => malotes.id),
    lacreMaloteId: uuid("lacre_malote_id").references(() => lacresMalotes.id),
    notaFiscalId: text("nota_fiscal_id"),
    temNotaFiscal: boolean("tem_nota_fiscal").notNull().default(false),
    computar: boolean("computar").notNull().default(true),
    fotoDocumentoUrl: text("foto_documento_url"),
    status: text("status").notNull().default("aprovado"),
    criadoPor: text("criado_por"),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    check(
      "movimentacoes_financeiras_tipo_check",
      sql`${table.tipo} in ('entrada', 'despesa', 'transferencia', 'mercadoria', 'retirada')`
    ),
    check(
      "movimentacoes_financeiras_status_check",
      sql`${table.status} in ('aprovado', 'aguardando_aprovacao', 'cancelado')`
    ),
    check("movimentacoes_financeiras_valor_original_check", sql`${table.valorOriginal} >= 0`),
    check("movimentacoes_financeiras_valor_acrescimo_check", sql`${table.valorAcrescimo} >= 0`),
    check("movimentacoes_financeiras_valor_desconto_check", sql`${table.valorDesconto} >= 0`)
  ]
);

export const itensDespesas = pgTable(
  "itens_despesas",
  {
    id: idUuid,
    movimentacaoId: uuid("movimentacao_id")
      .notNull()
      .references(() => movimentacoesFinanceiras.id, { onDelete: "cascade" }),
    grupoDespesaId: uuid("grupo_despesa_id").references(() => gruposDespesas.id),
    descricao: text("descricao").notNull(),
    valor: valorMonetario("valor").notNull()
  },
  (table) => [check("itens_despesas_valor_check", sql`${table.valor} >= 0`)]
);

export const itensMercadorias = pgTable(
  "itens_mercadorias",
  {
    id: idUuid,
    movimentacaoId: uuid("movimentacao_id")
      .notNull()
      .references(() => movimentacoesFinanceiras.id, { onDelete: "cascade" }),
    produtoId: uuid("produto_id").references(() => produtos.id),
    grupoMercadoriaId: uuid("grupo_mercadoria_id").references(() => gruposMercadorias.id),
    unidadeMedidaId: uuid("unidade_medida_id").references(() => unidadesMedida.id),
    descricao: text("descricao").notNull(),
    quantidade: numeric("quantidade", { precision: 14, scale: 3 }).notNull(),
    valorUnitario: numeric("valor_unitario", { precision: 14, scale: 4 }).notNull().default("0"),
    valorTotal: valorMonetario("valor_total").notNull()
  },
  (table) => [
    check("itens_mercadorias_quantidade_check", sql`${table.quantidade} > 0`),
    check("itens_mercadorias_valor_total_check", sql`${table.valorTotal} >= 0`)
  ]
);

export const fechamentosCaixa = pgTable(
  "fechamentos_caixa",
  {
    id: idUuid,
    empresaId,
    colaboradorId: uuid("colaborador_id")
      .notNull()
      .references(() => colaboradores.id),
    dataMovimento: date("data_movimento").notNull(),
    totalEntradas: valorMonetario("total_entradas").notNull().default("0"),
    totalTransferencias: valorMonetario("total_transferencias").notNull().default("0"),
    totalDespesas: valorMonetario("total_despesas").notNull().default("0"),
    totalRetiradas: valorMonetario("total_retiradas").notNull().default("0"),
    saldo: valorMonetario("saldo").notNull().default("0"),
    status: text("status").notNull().default("aberto"),
    criadoPor: text("criado_por"),
    criadoEm
  },
  (table) => [check("fechamentos_caixa_status_check", sql`${table.status} in ('aberto', 'fechado', 'ajustado')`)]
);

export const ajustesFechamentoCaixa = pgTable("ajustes_fechamento_caixa", {
  id: idUuid,
  fechamentoCaixaId: uuid("fechamento_caixa_id")
    .notNull()
    .references(() => fechamentosCaixa.id, { onDelete: "cascade" }),
  movimentacaoId: uuid("movimentacao_id").references(() => movimentacoesFinanceiras.id),
  valorDiferenca: valorMonetario("valor_diferenca").notNull(),
  criadoEm
});

export const itensVendas = pgTable("itens_vendas", {
  id: idUuid,
  empresaId,
  produtoId: uuid("produto_id").references(() => produtos.id),
  descricaoProduto: text("descricao_produto").notNull(),
  quantidade: numeric("quantidade", { precision: 14, scale: 3 }).notNull().default("0"),
  valorTotal: valorMonetario("valor_total").notNull().default("0"),
  dataVenda: date("data_venda").notNull(),
  criadoEm
});
