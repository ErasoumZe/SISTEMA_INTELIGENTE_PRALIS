import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  integer,
  jsonb,
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
import type { Permissao } from "@padaria/shared";
import type { CampoVinculoIntegracao, TipoIntegracao, TipoRegistroIntegracao } from "@padaria/shared/integracoes";

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

export const formasPagamento = pgTable(
  "formas_pagamento",
  {
    id: idUuid,
    empresaId,
    nome: text("nome").notNull(),
    criadoEm,
    atualizadoEm,
    importadoDe: uuid("importado_de").references(() => empresas.id, { onDelete: "set null" }),
    idImportado: uuid("id_importado")
  },
  (table) => [unique("formas_pagamento_empresa_nome_unica").on(table.empresaId, table.nome)]
);

export const pdvs = pgTable(
  "pdvs",
  {
    id: idUuid,
    empresaId,
    nome: text("nome").notNull(),
    codigo: text("codigo"),
    contaId: uuid("conta_id")
      .notNull()
      .references(() => contas.id),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    unique("pdvs_empresa_nome_unica").on(table.empresaId, table.nome),
    uniqueIndex("pdvs_empresa_codigo_unico_idx")
      .on(table.empresaId, sql`lower(${table.codigo})`)
      .where(sql`${table.codigo} is not null`)
  ]
);

export const fornecedores = pgTable("fornecedores", {
  id: idUuid,
  empresaId,
  nome: text("nome").notNull(),
  documento: text("documento"),
  criadoEm,
  importadoDe: uuid("importado_de").references(() => empresas.id, { onDelete: "set null" }),
  idImportado: uuid("id_importado")
});

export const clientes = pgTable(
  "clientes",
  {
    id: idUuid,
    empresaId,
    nome: text("nome").notNull(),
    documento: text("documento"),
    criadoEm,
    atualizadoEm,
    importadoDe: uuid("importado_de").references(() => empresas.id, { onDelete: "set null" }),
    idImportado: uuid("id_importado")
  },
  (table) => [
    uniqueIndex("clientes_empresa_documento_unico_idx")
      .on(table.empresaId, sql`lower(${table.documento})`)
      .where(sql`${table.documento} is not null`)
  ]
);

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

export const integracoesChaves = pgTable(
  "integracoes_chaves",
  {
    id: idUuid,
    empresaId,
    tipo: text("tipo").$type<TipoIntegracao>().notNull(),
    codigo: text("codigo").notNull(),
    ativa: boolean("ativa").notNull().default(true),
    criadoPor: text("criado_por"),
    criadoEm,
    inativadoEm: timestamp("inativado_em", { withTimezone: true })
  },
  (table) => [
    unique("integracoes_chaves_codigo_unico").on(table.codigo),
    check("integracoes_chaves_tipo_check", sql`${table.tipo} in ('vendas', 'produtos_vendas')`)
  ]
);

export const integracoesCamposConfig = pgTable(
  "integracoes_campos_config",
  {
    id: idUuid,
    empresaId,
    tipo: text("tipo").$type<TipoIntegracao>().notNull(),
    campo: text("campo").$type<CampoVinculoIntegracao>().notNull(),
    criarAutomaticamente: boolean("criar_automaticamente").notNull().default(true),
    vincularAutomaticamente: boolean("vincular_automaticamente").notNull().default(true),
    atualizadoEm
  },
  (table) => [
    unique("integracoes_campos_config_empresa_tipo_campo_unico").on(table.empresaId, table.tipo, table.campo),
    check("integracoes_campos_config_tipo_check", sql`${table.tipo} in ('vendas', 'produtos_vendas')`),
    check(
      "integracoes_campos_config_campo_check",
      sql`${table.campo} in ('pdv', 'cliente', 'vendedor', 'produto', 'forma_pagamento')`
    )
  ]
);

export const integracoesVinculos = pgTable(
  "integracoes_vinculos",
  {
    id: idUuid,
    empresaId,
    tipo: text("tipo").$type<TipoIntegracao>().notNull(),
    tipoRegistro: text("tipo_registro").$type<TipoRegistroIntegracao>().notNull(),
    identificadorExterno: text("identificador_externo").notNull(),
    descricaoExterna: text("descricao_externa"),
    registroSistemaId: uuid("registro_sistema_id"),
    pendente: boolean("pendente").notNull().default(true),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    unique("integracoes_vinculos_externo_unico").on(
      table.empresaId,
      table.tipo,
      table.tipoRegistro,
      table.identificadorExterno
    ),
    check("integracoes_vinculos_tipo_check", sql`${table.tipo} in ('vendas', 'produtos_vendas')`),
    check(
      "integracoes_vinculos_tipo_registro_check",
      sql`${table.tipoRegistro} in ('venda', 'pdv', 'cliente', 'colaborador', 'produto', 'forma_pagamento')`
    )
  ]
);

export const integracoesRegistros = pgTable(
  "integracoes_registros",
  {
    id: idUuid,
    empresaId,
    integracaoChaveId: uuid("integracao_chave_id")
      .notNull()
      .references(() => integracoesChaves.id, { onDelete: "cascade" }),
    tipoRegistro: text("tipo_registro").$type<TipoRegistroIntegracao>().notNull(),
    identificadorExterno: text("identificador_externo").notNull(),
    hashConteudo: text("hash_conteudo").notNull(),
    registroSistemaId: uuid("registro_sistema_id").notNull(),
    payload: jsonb("payload").notNull(),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    unique("integracoes_registros_externo_unico").on(
      table.empresaId,
      table.integracaoChaveId,
      table.tipoRegistro,
      table.identificadorExterno
    ),
    check(
      "integracoes_registros_tipo_registro_check",
      sql`${table.tipoRegistro} in ('venda', 'pdv', 'cliente', 'colaborador', 'produto', 'forma_pagamento')`
    )
  ]
);

export const integracoesHistorico = pgTable(
  "integracoes_historico",
  {
    id: idUuid,
    empresaId,
    integracaoChaveId: uuid("integracao_chave_id")
      .notNull()
      .references(() => integracoesChaves.id, { onDelete: "cascade" }),
    tipo: text("tipo").$type<TipoIntegracao>().notNull(),
    identificadorExterno: text("identificador_externo"),
    hashConteudo: text("hash_conteudo"),
    status: text("status").notNull(),
    mensagemErro: text("mensagem_erro"),
    payload: jsonb("payload").notNull(),
    criadoEm
  },
  (table) => [
    check("integracoes_historico_tipo_check", sql`${table.tipo} in ('vendas', 'produtos_vendas')`),
    check("integracoes_historico_status_check", sql`${table.status} in ('criado', 'atualizado', 'sem_novidade', 'erro')`)
  ]
);

export const integracoesSemNovidade = pgTable("integracoes_sem_novidade", {
  id: idUuid,
  empresaId,
  integracaoChaveId: uuid("integracao_chave_id")
    .notNull()
    .references(() => integracoesChaves.id, { onDelete: "cascade" }),
  tipo: text("tipo").$type<TipoIntegracao>().notNull(),
  identificadorExterno: text("identificador_externo").notNull(),
  hashConteudo: text("hash_conteudo").notNull(),
  payload: jsonb("payload").notNull(),
  criadoEm
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

export const vendas = pgTable(
  "vendas",
  {
    id: idUuid,
    empresaId,
    integracaoChaveId: uuid("integracao_chave_id").references(() => integracoesChaves.id, { onDelete: "set null" }),
    caixaId: uuid("caixa_id").references((): AnyPgColumn => fechamentosCaixa.id),
    dataReferencia: date("data_referencia").notNull(),
    dataVenda: timestamp("data_venda", { withTimezone: true }),
    descricao: text("descricao").notNull(),
    observacao: text("observacao"),
    valorOriginal: valorMonetario("valor_original").notNull(),
    valorAcrescimo: valorMonetario("valor_acrescimo").notNull().default("0"),
    descricaoAcrescimo: text("descricao_acrescimo"),
    valorDesconto: valorMonetario("valor_desconto").notNull().default("0"),
    descricaoDesconto: text("descricao_desconto"),
    dataPagamento: date("data_pagamento"),
    contaOrigemId: uuid("conta_origem_id").references(() => contas.id),
    pdvId: uuid("pdv_id").references(() => pdvs.id),
    colaboradorId: uuid("colaborador_id").references(() => colaboradores.id),
    clienteId: uuid("cliente_id").references(() => clientes.id),
    identificadorExterno: text("identificador_externo"),
    hashIntegracao: text("hash_integracao"),
    statusExterno: text("status_externo"),
    numeroNotaFiscal: text("numero_nota_fiscal"),
    pdvAutomacaoId: text("pdv_automacao_id"),
    pdvAutomacao: text("pdv_automacao"),
    vendedorAutomacaoId: text("vendedor_automacao_id"),
    vendedorAutomacao: text("vendedor_automacao"),
    vendedorAutomacaoDocumento: text("vendedor_automacao_documento"),
    clienteAutomacaoId: text("cliente_automacao_id"),
    clienteAutomacao: text("cliente_automacao"),
    clienteAutomacaoDocumento: text("cliente_automacao_documento"),
    automacaoId: text("automacao_id"),
    computar: boolean("computar").notNull().default(true),
    status: text("status").notNull().default("aprovado"),
    criadoPor: text("criado_por"),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    check("vendas_status_check", sql`${table.status} in ('aprovado', 'aguardando_aprovacao', 'cancelado')`),
    check("vendas_valor_original_check", sql`${table.valorOriginal} >= 0`),
    check("vendas_valor_acrescimo_check", sql`${table.valorAcrescimo} >= 0`),
    check("vendas_valor_desconto_check", sql`${table.valorDesconto} >= 0`)
  ]
);

export const vendasProdutos = pgTable(
  "vendas_produtos",
  {
    id: idUuid,
    vendaId: uuid("venda_id")
      .notNull()
      .references(() => vendas.id, { onDelete: "cascade" }),
    produtoId: uuid("produto_id").references(() => produtos.id),
    produtoAutomacaoId: text("produto_automacao_id"),
    produtoAutomacaoCodigo: text("produto_automacao_codigo"),
    descricaoProduto: text("descricao_produto").notNull(),
    dataHoraItem: timestamp("data_hora_item", { withTimezone: true }),
    quantidade: numeric("quantidade", { precision: 14, scale: 3 }).notNull().default("0"),
    valorUnitario: numeric("valor_unitario", { precision: 14, scale: 4 }).notNull().default("0"),
    valorDesconto: valorMonetario("valor_desconto").notNull().default("0"),
    valorAcrescimo: valorMonetario("valor_acrescimo").notNull().default("0"),
    valorTotal: valorMonetario("valor_total").notNull().default("0"),
    cancelado: boolean("cancelado").notNull().default(false),
    criadoEm
  },
  (table) => [
    check("vendas_produtos_quantidade_check", sql`${table.quantidade} >= 0`),
    check("vendas_produtos_valor_unitario_check", sql`${table.valorUnitario} >= 0`),
    check("vendas_produtos_valor_desconto_check", sql`${table.valorDesconto} >= 0`),
    check("vendas_produtos_valor_acrescimo_check", sql`${table.valorAcrescimo} >= 0`),
    check("vendas_produtos_valor_total_check", sql`${table.valorTotal} >= 0`)
  ]
);

export const vendasPagamentos = pgTable(
  "vendas_pagamentos",
  {
    id: idUuid,
    vendaId: uuid("venda_id")
      .notNull()
      .references(() => vendas.id, { onDelete: "cascade" }),
    formaPagamentoId: uuid("forma_pagamento_id").references(() => formasPagamento.id),
    tipoPagamentoAutomacaoId: text("tipo_pagamento_automacao_id"),
    tipoPagamentoAutomacao: text("tipo_pagamento_automacao"),
    numeroVendas: integer("numero_vendas").notNull().default(0),
    totalPago: valorMonetario("total_pago").notNull().default("0"),
    criadoEm
  },
  (table) => [
    check("vendas_pagamentos_numero_vendas_check", sql`${table.numeroVendas} >= 0`),
    check("vendas_pagamentos_total_pago_check", sql`${table.totalPago} >= 0`)
  ]
);

export const despesas = pgTable(
  "despesas",
  {
    id: idUuid,
    empresaId,
    caixaId: uuid("caixa_id").references((): AnyPgColumn => fechamentosCaixa.id),
    grupoDespesaId: uuid("grupo_despesa_id").references(() => gruposDespesas.id),
    fornecedorId: uuid("fornecedor_id").references(() => fornecedores.id),
    colaboradorId: uuid("colaborador_id").references(() => colaboradores.id),
    dataReferencia: date("data_referencia").notNull(),
    dataVencimento: date("data_vencimento").notNull(),
    dataPagamento: date("data_pagamento"),
    descricao: text("descricao").notNull(),
    observacao: text("observacao"),
    valorOriginal: valorMonetario("valor_original").notNull(),
    valorAcrescimo: valorMonetario("valor_acrescimo").notNull().default("0"),
    descricaoAcrescimo: text("descricao_acrescimo"),
    valorDesconto: valorMonetario("valor_desconto").notNull().default("0"),
    descricaoDesconto: text("descricao_desconto"),
    contaOrigemId: uuid("conta_origem_id").references(() => contas.id),
    computar: boolean("computar").notNull().default(true),
    fotoDocumentoUrl: text("foto_documento_url"),
    status: text("status").notNull().default("aprovado"),
    criadoPor: text("criado_por"),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    check("despesas_status_check", sql`${table.status} in ('aprovado', 'aguardando_aprovacao', 'cancelado')`),
    check("despesas_valor_original_check", sql`${table.valorOriginal} >= 0`),
    check("despesas_valor_acrescimo_check", sql`${table.valorAcrescimo} >= 0`),
    check("despesas_valor_desconto_check", sql`${table.valorDesconto} >= 0`)
  ]
);

export const despesasItens = pgTable(
  "despesas_itens",
  {
    id: idUuid,
    despesaId: uuid("despesa_id")
      .notNull()
      .references(() => despesas.id, { onDelete: "cascade" }),
    grupoDespesaId: uuid("grupo_despesa_id").references(() => gruposDespesas.id),
    colaboradorId: uuid("colaborador_id").references(() => colaboradores.id),
    descricao: text("descricao").notNull(),
    valor: valorMonetario("valor").notNull()
  },
  (table) => [check("despesas_itens_valor_check", sql`${table.valor} >= 0`)]
);

export const mercadorias = pgTable(
  "mercadorias",
  {
    id: idUuid,
    empresaId,
    caixaId: uuid("caixa_id").references((): AnyPgColumn => fechamentosCaixa.id),
    grupoMercadoriaId: uuid("grupo_mercadoria_id").references(() => gruposMercadorias.id),
    fornecedorId: uuid("fornecedor_id").references(() => fornecedores.id),
    dataReferencia: date("data_referencia").notNull(),
    dataVencimento: date("data_vencimento").notNull(),
    dataPagamento: date("data_pagamento"),
    descricao: text("descricao").notNull(),
    observacao: text("observacao"),
    valorOriginal: valorMonetario("valor_original").notNull(),
    valorAcrescimo: valorMonetario("valor_acrescimo").notNull().default("0"),
    descricaoAcrescimo: text("descricao_acrescimo"),
    valorDesconto: valorMonetario("valor_desconto").notNull().default("0"),
    descricaoDesconto: text("descricao_desconto"),
    contaOrigemId: uuid("conta_origem_id").references(() => contas.id),
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
    check("mercadorias_status_check", sql`${table.status} in ('aprovado', 'aguardando_aprovacao', 'cancelado')`),
    check("mercadorias_valor_original_check", sql`${table.valorOriginal} >= 0`),
    check("mercadorias_valor_acrescimo_check", sql`${table.valorAcrescimo} >= 0`),
    check("mercadorias_valor_desconto_check", sql`${table.valorDesconto} >= 0`)
  ]
);

export const mercadoriasItens = pgTable(
  "mercadorias_itens",
  {
    id: idUuid,
    mercadoriaId: uuid("mercadoria_id")
      .notNull()
      .references(() => mercadorias.id, { onDelete: "cascade" }),
    produtoId: uuid("produto_id").references(() => produtos.id),
    grupoMercadoriaId: uuid("grupo_mercadoria_id").references(() => gruposMercadorias.id),
    unidadeMedidaId: uuid("unidade_medida_id").references(() => unidadesMedida.id),
    descricao: text("descricao").notNull(),
    quantidade: numeric("quantidade", { precision: 14, scale: 3 }).notNull(),
    valorUnitario: numeric("valor_unitario", { precision: 14, scale: 4 }).notNull().default("0"),
    valorTotal: valorMonetario("valor_total").notNull()
  },
  (table) => [
    check("mercadorias_itens_quantidade_check", sql`${table.quantidade} > 0`),
    check("mercadorias_itens_valor_total_check", sql`${table.valorTotal} >= 0`)
  ]
);

export const retiradas = pgTable(
  "retiradas",
  {
    id: idUuid,
    empresaId,
    caixaId: uuid("caixa_id").references((): AnyPgColumn => fechamentosCaixa.id),
    grupoRetiradaId: uuid("grupo_retirada_id").references(() => gruposRetiradas.id),
    colaboradorId: uuid("colaborador_id")
      .notNull()
      .references(() => colaboradores.id),
    dataReferencia: date("data_referencia").notNull(),
    dataVencimento: date("data_vencimento").notNull(),
    dataPagamento: date("data_pagamento"),
    descricao: text("descricao").notNull(),
    observacao: text("observacao"),
    valorOriginal: valorMonetario("valor_original").notNull(),
    valorAcrescimo: valorMonetario("valor_acrescimo").notNull().default("0"),
    descricaoAcrescimo: text("descricao_acrescimo"),
    valorDesconto: valorMonetario("valor_desconto").notNull().default("0"),
    descricaoDesconto: text("descricao_desconto"),
    contaOrigemId: uuid("conta_origem_id").references(() => contas.id),
    computar: boolean("computar").notNull().default(true),
    status: text("status").notNull().default("aprovado"),
    criadoPor: text("criado_por"),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    check("retiradas_status_check", sql`${table.status} in ('aprovado', 'aguardando_aprovacao', 'cancelado')`),
    check("retiradas_valor_original_check", sql`${table.valorOriginal} >= 0`),
    check("retiradas_valor_acrescimo_check", sql`${table.valorAcrescimo} >= 0`),
    check("retiradas_valor_desconto_check", sql`${table.valorDesconto} >= 0`)
  ]
);

export const transferencias = pgTable(
  "transferencias",
  {
    id: idUuid,
    empresaId,
    caixaId: uuid("caixa_id").references((): AnyPgColumn => fechamentosCaixa.id),
    dataReferencia: date("data_referencia").notNull(),
    descricao: text("descricao").notNull(),
    observacao: text("observacao"),
    valorOriginal: valorMonetario("valor_original").notNull(),
    valorAcrescimo: valorMonetario("valor_acrescimo").notNull().default("0"),
    descricaoAcrescimo: text("descricao_acrescimo"),
    valorDesconto: valorMonetario("valor_desconto").notNull().default("0"),
    descricaoDesconto: text("descricao_desconto"),
    contaOrigemId: uuid("conta_origem_id")
      .notNull()
      .references(() => contas.id),
    contaDestinoId: uuid("conta_destino_id")
      .notNull()
      .references(() => contas.id),
    maloteId: uuid("malote_id").references(() => malotes.id),
    lacreMaloteId: uuid("lacre_malote_id").references(() => lacresMalotes.id),
    computar: boolean("computar").notNull().default(true),
    status: text("status").notNull().default("aprovado"),
    criadoPor: text("criado_por"),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    check("transferencias_status_check", sql`${table.status} in ('aprovado', 'aguardando_aprovacao', 'cancelado')`),
    check("transferencias_valor_original_check", sql`${table.valorOriginal} >= 0`),
    check("transferencias_valor_acrescimo_check", sql`${table.valorAcrescimo} >= 0`),
    check("transferencias_valor_desconto_check", sql`${table.valorDesconto} >= 0`),
    check("transferencias_contas_diferentes_check", sql`${table.contaOrigemId} <> ${table.contaDestinoId}`)
  ]
);

export const fechamentosCaixa = pgTable(
  "fechamentos_caixa",
  {
    id: idUuid,
    empresaId,
    pdvId: uuid("pdv_id").references(() => pdvs.id),
    usuarioId: text("usuario_id").references(() => perfisUsuarios.usuarioId),
    usuarioCaixaId: text("usuario_caixa_id").references(() => perfisUsuarios.usuarioId),
    colaboradorId: uuid("colaborador_id")
      .notNull()
      .references(() => colaboradores.id),
    dataMovimento: date("data_movimento").notNull(),
    dataHoraAbertura: timestamp("data_hora_abertura", { withTimezone: true }),
    abertoEm: timestamp("aberto_em", { withTimezone: true }),
    dataHoraFechamento: timestamp("data_hora_fechamento", { withTimezone: true }),
    fechadoEm: timestamp("fechado_em", { withTimezone: true }),
    tokenEdicao: text("token_edicao"),
    observacao: text("observacao"),
    totalEntradas: valorMonetario("total_entradas").notNull().default("0"),
    totalTransferencias: valorMonetario("total_transferencias").notNull().default("0"),
    totalTransferenciasEntrada: valorMonetario("total_transferencias_entrada").notNull().default("0"),
    totalTransferenciasSaida: valorMonetario("total_transferencias_saida").notNull().default("0"),
    totalDespesas: valorMonetario("total_despesas").notNull().default("0"),
    totalRetiradas: valorMonetario("total_retiradas").notNull().default("0"),
    totalMercadorias: valorMonetario("total_mercadorias").notNull().default("0"),
    saldo: valorMonetario("saldo").notNull().default("0"),
    status: text("status").notNull().default("aberto"),
    criadoPor: text("criado_por"),
    criadoEm
  },
  (table) => [check("fechamentos_caixa_status_check", sql`${table.status} in ('aberto', 'fechado', 'ajustado')`)]
);

export const edicoesCaixa = pgTable("edicoes_caixa", {
  id: idUuid,
  caixaId: uuid("caixa_id")
    .notNull()
    .references(() => fechamentosCaixa.id, { onDelete: "cascade" }),
  tokenUsado: text("token_usado").notNull(),
  editadoPor: text("editado_por").references(() => perfisUsuarios.usuarioId),
  editadoEm: timestamp("editado_em", { withTimezone: true }).notNull().defaultNow(),
  valoresAntigos: jsonb("valores_antigos").notNull(),
  valoresNovos: jsonb("valores_novos").notNull()
});

export const ajustesFechamentoCaixa = pgTable("ajustes_fechamento_caixa", {
  id: idUuid,
  fechamentoCaixaId: uuid("fechamento_caixa_id")
    .notNull()
    .references(() => fechamentosCaixa.id, { onDelete: "cascade" }),
  despesaId: uuid("despesa_id").references(() => despesas.id),
  valorDiferenca: valorMonetario("valor_diferenca").notNull(),
  criadoEm
});

export const debitosColaboradores = pgTable(
  "debitos_colaboradores",
  {
    id: idUuid,
    empresaId,
    colaboradorId: uuid("colaborador_id")
      .notNull()
      .references(() => colaboradores.id),
    tipo: text("tipo").notNull(),
    despesaId: uuid("despesa_id").references(() => despesas.id),
    retiradaId: uuid("retirada_id").references(() => retiradas.id),
    caixaId: uuid("caixa_id").references(() => fechamentosCaixa.id),
    valor: valorMonetario("valor").notNull(),
    observacao: text("observacao"),
    criadoPor: text("criado_por").references(() => perfisUsuarios.usuarioId),
    criadoEm
  },
  (table) => [
    check("debitos_colaboradores_tipo_check", sql`${table.tipo} in ('FECHAMENTO_CAIXA', 'DESPESA', 'RETIRADA')`),
    check("debitos_colaboradores_valor_check", sql`${table.valor} >= 0`)
  ]
);

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
