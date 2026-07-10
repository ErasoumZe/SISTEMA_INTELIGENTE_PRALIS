import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
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
import type { Permissao, RegrasPermissoes } from "@padaria/shared";
import type { CampoVinculoIntegracao, TipoIntegracao, TipoRegistroIntegracao } from "@padaria/shared/integracoes";
import type { ConfiguracaoAparenciaEmpresa } from "@padaria/shared/tema";

const criadoEm = timestamp("criado_em", { withTimezone: true }).notNull().defaultNow();
const atualizadoEm = timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow();
const idUuid = uuid("id")
  .primaryKey()
  .default(sql`uuid_generate_v7()`);
const empresaId = uuid("empresa_id")
  .notNull()
  .references(() => empresas.id, { onDelete: "cascade" });
const valorMonetario = (nome: string) => numeric(nome, { precision: 14, scale: 2 });

export const empresas = pgTable("empresas", {
  id: idUuid,
  nome: text("nome").notNull(),
  cnpj: text("cnpj"),
  configuracoesAparencia: jsonb("configuracoes_aparencia")
    .$type<ConfiguracaoAparenciaEmpresa>()
    .notNull()
    .default(
      sql`'{"padrao":{"corPrimaria":"#6d28d9","corSecundaria":"#0891b2","corFundo":"#eaf1f9","corCartao":"#ffffff","corSucesso":"#16a34a","corAviso":"#f59e0b","corErro":"#ef4444"},"especifico":[]}'::jsonb`
    ),
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
    regras: jsonb("regras")
      .$type<RegrasPermissoes>()
      .notNull()
      .default(sql`'{}'::jsonb`)
  },
  (table) => [primaryKey({ columns: [table.usuarioId] })]
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
    dataNascimento: text("data_nascimento"),
    whatsapp: text("whatsapp"),
    email: text("email"),
    cep: text("cep"),
    rua: text("rua"),
    numero: text("numero"),
    complemento: text("complemento"),
    bairro: text("bairro"),
    cidade: text("cidade"),
    estado: text("estado"),
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
    regras: jsonb("regras")
      .$type<RegrasPermissoes>()
      .notNull()
      .default(sql`'{}'::jsonb`)
  },
  (table) => [primaryKey({ columns: [table.cargoId] })]
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

export const gruposVendas = pgTable("grupos_vendas", {
  id: idUuid,
  empresaId,
  nome: text("nome").notNull(),
  grupoPaiId: uuid("grupo_pai_id").references((): AnyPgColumn => gruposVendas.id),
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

export const permissoesSetores = pgTable(
  "permissoes_setores",
  {
    setorId: uuid("setor_id")
      .notNull()
      .references(() => setores.id, { onDelete: "cascade" }),
    regras: jsonb("regras")
      .$type<RegrasPermissoes>()
      .notNull()
      .default(sql`'{}'::jsonb`)
  },
  (table) => [primaryKey({ columns: [table.setorId] })]
);

export const produtos = pgTable(
  "produtos",
  {
    id: idUuid,
    empresaId,
    grupoMercadoriaId: uuid("grupo_mercadoria_id").references(() => gruposMercadorias.id),
    unidadeMedidaId: uuid("unidade_medida_id").references(() => unidadesMedida.id),
    unidadeIndividualId: uuid("unidade_individual_id").references(() => unidadesMedida.id),
    codigo: text("codigo"), // codigo externo (PR-XXXX-XXXX gerado quando vazio; ou manual)
    codigoInterno: text("codigo_interno"), // sequencial 5 digitos por empresa; herdado na importacao
    codigoBarras: text("codigo_barras"),
    descricao: text("descricao").notNull(), // auto (montarDescricao) por padrao, com override manual
    marca: text("marca"),
    quantidadeIndividual: numeric("quantidade_individual", { precision: 14, scale: 3 }).notNull().default("1"),
    // Como se compra (porte do Pralis; enums fieis mantidos como texto)
    embalagem: text("embalagem"), // sigla de unidades_medida (cadastro de Unidades)
    cDe: text("c_de"), // C/ | DE (preposicao de "como se compra")
    quantidadeCaixa: integer("quantidade_caixa").notNull().default(1), // qtCad: unidades por embalagem/caixa
    medidaCompra: text("medida_compra"), // sigla de unidades_medida (cadastro de Unidades)
    // Comercial (por empresa/loja) — preco = referencia de catalogo (vendas seguem do CREARE).
    custo: numeric("custo", { precision: 14, scale: 2 }),
    margem: numeric("margem", { precision: 6, scale: 4 }), // fracao (0.30 = 30%)
    precoVenda: numeric("preco_venda", { precision: 14, scale: 2 }),
    auto: boolean("auto").notNull().default(false),
    status: text("status").notNull().default("ativo"), // ativo | inativo
    tipo: text("tipo").notNull().default("revenda"), // revenda | transformacao
    // Estoque (saldo + parametrizacao). quantidadeEstoque = "quantidade" do Pralis (distinta de quantidadeIndividual/Caixa).
    quantidadeEstoque: numeric("quantidade_estoque", { precision: 14, scale: 3 }).notNull().default("0"),
    estoqueMin: numeric("estoque_min", { precision: 14, scale: 3 }),
    estoqueMax: numeric("estoque_max", { precision: 14, scale: 3 }),
    setorEstoque: text("setor_estoque"),
    // Locais de venda e foto
    localVenda1: text("local_venda_1"),
    localVenda2: text("local_venda_2"),
    fotoUrl: text("foto_url"),
    criadoPor: text("criado_por"), // auditoria (usuarioId; nome resolvido via join)
    criadoEm,
    atualizadoEm,
    importadoDe: uuid("importado_de").references(() => empresas.id, { onDelete: "set null" }),
    idImportado: uuid("id_importado")
  },
  (table) => [
    // codigo interno unico por empresa (NULLs sao distintos no Postgres, entao produtos ainda sem codigo convivem)
    uniqueIndex("produtos_codigo_interno_empresa_uidx").on(table.empresaId, table.codigoInterno),
    check("produtos_status_check", sql`${table.status} in ('ativo', 'inativo')`),
    check("produtos_tipo_check", sql`${table.tipo} in ('revenda', 'transformacao')`)
  ]
);

export const produtosConversoes = pgTable(
  "produtos_conversoes",
  {
    id: idUuid,
    produtoId: uuid("produto_id")
      .notNull()
      .references(() => produtos.id, { onDelete: "cascade" }),
    unidadeMedidaId: uuid("unidade_medida_id")
      .notNull()
      .references(() => unidadesMedida.id),
    quantidade: numeric("quantidade", { precision: 14, scale: 3 }).notNull(),
    unidadesIndividuais: numeric("unidades_individuais", { precision: 14, scale: 3 }).notNull(),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    check("produtos_conversoes_quantidade_check", sql`${table.quantidade} > 0`),
    check("produtos_conversoes_unidades_individuais_check", sql`${table.unidadesIndividuais} > 0`)
  ]
);

// Dados tributarios do produto (1:1). Porte de product_fiscal do Pralis; aliquotas em fracao (scale 4).
// So armazena os campos — nao ha calculo fiscal (nem no Pralis nem no ERP hoje).
export const produtosFiscal = pgTable("produtos_fiscal", {
  produtoId: uuid("produto_id")
    .primaryKey()
    .references(() => produtos.id, { onDelete: "cascade" }),
  ncm: text("ncm"),
  cest: text("cest"),
  categoriaFiscal: text("categoria_fiscal"),
  cstPisCofins: text("cst_pis_cofins"),
  aliquotaCheia: numeric("aliquota_cheia", { precision: 6, scale: 4 }),
  aliquotaFcp: numeric("aliquota_fcp", { precision: 6, scale: 4 }),
  aliquotaPis: numeric("aliquota_pis", { precision: 6, scale: 4 }),
  aliquotaCofins: numeric("aliquota_cofins", { precision: 6, scale: 4 }),
  reducaoIcms: numeric("reducao_icms", { precision: 6, scale: 4 }),
  icms: numeric("icms", { precision: 6, scale: 4 }),
  criadoEm,
  atualizadoEm
});

// Ficha de transformacao/receita (1:1, presente quando produtos.tipo = 'transformacao').
// Porte de product_transformacao do Pralis. unidade agora vem do cadastro de Unidades (grava a sigla).
export const produtosTransformacao = pgTable(
  "produtos_transformacao",
  {
    produtoId: uuid("produto_id")
      .primaryKey()
      .references(() => produtos.id, { onDelete: "cascade" }),
    precisao: text("precisao"), // EXATOS | APROXIMADOS
    quantidade: numeric("quantidade", { precision: 14, scale: 3 }),
    unidade: text("unidade"), // sigla de unidades_medida (cadastro de Unidades)
    produtoReceituario: text("produto_receituario"),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    check(
      "produtos_transformacao_precisao_check",
      sql`${table.precisao} is null or ${table.precisao} in ('EXATOS', 'APROXIMADOS')`
    )
  ]
);

// Promocoes do produto (1:N). Porte de promocoes do Pralis: preco fixo (valor) ou desconto (fracao),
// janela de horario e dias da semana. Consumida por calcularPrecoVendaComPromocao (ja portada).
export const produtosPromocoes = pgTable(
  "produtos_promocoes",
  {
    id: idUuid,
    produtoId: uuid("produto_id")
      .notNull()
      .references(() => produtos.id, { onDelete: "cascade" }),
    tipo: text("tipo").notNull(), // valor | desconto
    valor: numeric("valor", { precision: 14, scale: 2 }),
    descontoFracao: numeric("desconto_fracao", { precision: 6, scale: 4 }), // 0.10 = 10%
    horaInicio: time("hora_inicio"),
    horaFim: time("hora_fim"),
    seg: boolean("seg").notNull().default(false),
    ter: boolean("ter").notNull().default(false),
    qua: boolean("qua").notNull().default(false),
    qui: boolean("qui").notNull().default(false),
    sex: boolean("sex").notNull().default(false),
    sab: boolean("sab").notNull().default(false),
    dom: boolean("dom").notNull().default(false),
    validaAte: date("valida_ate"),
    criadoEm,
    atualizadoEm
  },
  (table) => [check("produtos_promocoes_tipo_check", sql`${table.tipo} in ('valor', 'desconto')`)]
);

export const integracoesChaves = pgTable(
  "integracoes_chaves",
  {
    id: idUuid,
    empresaId,
    tipo: text("tipo").$type<TipoIntegracao>().notNull(),
    codigo: text("codigo").notNull(),
    codigoHash: text("codigo_hash"),
    ativa: boolean("ativa").notNull().default(true),
    criadoPor: text("criado_por"),
    criadoEm,
    inativadoEm: timestamp("inativado_em", { withTimezone: true })
  },
  (table) => [
    unique("integracoes_chaves_codigo_unico").on(table.codigo),
    uniqueIndex("integracoes_chaves_codigo_hash_unico_idx")
      .on(table.codigoHash)
      .where(sql`${table.codigoHash} is not null`),
    check("integracoes_chaves_tipo_check", sql`${table.tipo} in ('vendas')`)
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
    check("integracoes_campos_config_tipo_check", sql`${table.tipo} in ('vendas')`),
    check(
      "integracoes_campos_config_campo_check",
      sql`${table.campo} in ('pdv', 'cliente', 'produto', 'forma_pagamento')`
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
    check("integracoes_vinculos_tipo_check", sql`${table.tipo} in ('vendas')`),
    check(
      "integracoes_vinculos_tipo_registro_check",
      sql`${table.tipoRegistro} in ('venda', 'pdv', 'cliente', 'produto', 'forma_pagamento')`
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
      sql`${table.tipoRegistro} in ('venda', 'pdv', 'cliente', 'produto', 'forma_pagamento')`
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
    check("integracoes_historico_tipo_check", sql`${table.tipo} in ('vendas')`),
    check(
      "integracoes_historico_status_check",
      sql`${table.status} in ('criado', 'atualizado', 'sem_novidade', 'erro')`
    )
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
    check("vendas_valor_desconto_check", sql`${table.valorDesconto} >= 0`),
    index("vendas_empresa_data_idx").on(table.empresaId, table.dataReferencia),
    index("vendas_caixa_idx").on(table.caixaId)
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
    check("vendas_produtos_valor_total_check", sql`${table.valorTotal} >= 0`),
    index("vendas_produtos_venda_idx").on(table.vendaId)
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
    check("vendas_pagamentos_total_pago_check", sql`${table.totalPago} >= 0`),
    index("vendas_pagamentos_venda_idx").on(table.vendaId)
  ]
);

export const vendasComprovantes = pgTable("vendas_comprovantes", {
  id: idUuid,
  vendaId: uuid("venda_id")
    .notNull()
    .references(() => vendas.id, { onDelete: "cascade" }),
  nomeOriginal: text("nome_original").notNull(),
  nomeArquivo: text("nome_arquivo").notNull(),
  caminho: text("caminho").notNull(),
  mimeType: text("mime_type").notNull(),
  tamanhoBytes: integer("tamanho_bytes").notNull(),
  criadoPor: text("criado_por").references(() => perfisUsuarios.usuarioId),
  criadoEm
});

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
    check("despesas_valor_desconto_check", sql`${table.valorDesconto} >= 0`),
    index("despesas_empresa_data_idx").on(table.empresaId, table.dataReferencia),
    index("despesas_caixa_idx").on(table.caixaId)
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
  (table) => [
    check("despesas_itens_valor_check", sql`${table.valor} >= 0`),
    index("despesas_itens_despesa_idx").on(table.despesaId)
  ]
);

// PEDIDOS de compra/reposicao de estoque (V1). Header + itens. Itens podem ter fornecedores
// diferentes (misto). Agendamento por data unica (dataAgendada) e/ou recorrencia.
export const pedidos = pgTable(
  "pedidos",
  {
    id: idUuid,
    empresaId,
    tipo: text("tipo").notNull().default("manual"),
    status: text("status").notNull().default("rascunho"),
    dataAgendada: timestamp("data_agendada", { withTimezone: true }),
    recorrencia: text("recorrencia").notNull().default("nenhuma"),
    observacao: text("observacao"),
    criadoPor: text("criado_por"),
    aprovadoPor: text("aprovado_por"),
    aprovadoEm: timestamp("aprovado_em", { withTimezone: true }),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    check("pedidos_tipo_check", sql`${table.tipo} in ('manual', 'automatico')`),
    check("pedidos_status_check", sql`${table.status} in ('rascunho', 'aprovado', 'cancelado')`),
    check("pedidos_recorrencia_check", sql`${table.recorrencia} in ('nenhuma', 'semanal', 'quinzenal', 'mensal')`),
    index("pedidos_empresa_status_idx").on(table.empresaId, table.status)
  ]
);

export const pedidosItens = pgTable(
  "pedidos_itens",
  {
    id: idUuid,
    pedidoId: uuid("pedido_id")
      .notNull()
      .references(() => pedidos.id, { onDelete: "cascade" }),
    produtoId: uuid("produto_id").references(() => produtos.id),
    fornecedorId: uuid("fornecedor_id").references(() => fornecedores.id),
    descricaoProduto: text("descricao_produto").notNull(),
    quantidade: numeric("quantidade", { precision: 14, scale: 3 }).notNull(),
    // Snapshot do estoque no momento da geracao (auditoria do pedido automatico).
    estoqueAtual: numeric("estoque_atual", { precision: 14, scale: 3 }),
    estoqueMin: numeric("estoque_min", { precision: 14, scale: 3 }),
    estoqueMax: numeric("estoque_max", { precision: 14, scale: 3 })
  },
  (table) => [
    check("pedidos_itens_quantidade_check", sql`${table.quantidade} > 0`),
    index("pedidos_itens_pedido_idx").on(table.pedidoId)
  ]
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
    check("mercadorias_valor_desconto_check", sql`${table.valorDesconto} >= 0`),
    index("mercadorias_empresa_data_idx").on(table.empresaId, table.dataReferencia),
    index("mercadorias_caixa_idx").on(table.caixaId)
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
    // Desconto por item, informado na discriminacao. tipo null = sem desconto;
    // valor e % (quando tipo='percentual') ou R$ (quando tipo='valor'). valor_total ja e liquido.
    descontoTipo: text("desconto_tipo"),
    descontoValor: numeric("desconto_valor", { precision: 14, scale: 4 }),
    valorTotal: valorMonetario("valor_total").notNull()
  },
  (table) => [
    check("mercadorias_itens_quantidade_check", sql`${table.quantidade} > 0`),
    check("mercadorias_itens_valor_total_check", sql`${table.valorTotal} >= 0`),
    check(
      "mercadorias_itens_desconto_tipo_check",
      sql`${table.descontoTipo} is null or ${table.descontoTipo} in ('percentual', 'valor')`
    ),
    check("mercadorias_itens_desconto_valor_check", sql`${table.descontoValor} is null or ${table.descontoValor} >= 0`),
    index("mercadorias_itens_mercadoria_idx").on(table.mercadoriaId)
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
    check("retiradas_valor_desconto_check", sql`${table.valorDesconto} >= 0`),
    index("retiradas_empresa_data_idx").on(table.empresaId, table.dataReferencia),
    index("retiradas_caixa_idx").on(table.caixaId)
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
    check("transferencias_contas_diferentes_check", sql`${table.contaOrigemId} <> ${table.contaDestinoId}`),
    index("transferencias_empresa_data_idx").on(table.empresaId, table.dataReferencia),
    index("transferencias_caixa_idx").on(table.caixaId)
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
  (table) => [
    check("fechamentos_caixa_status_check", sql`${table.status} in ('aberto', 'fechado', 'ajustado')`),
    uniqueIndex("fechamentos_caixa_pdv_aberto_unico_idx")
      .on(table.pdvId)
      .where(sql`${table.status} = 'aberto'`),
    index("fechamentos_caixa_empresa_data_idx").on(table.empresaId, table.dataMovimento)
  ]
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
    check("debitos_colaboradores_valor_check", sql`${table.valor} >= 0`),
    index("debitos_colaboradores_empresa_colaborador_idx").on(table.empresaId, table.colaboradorId)
  ]
);
