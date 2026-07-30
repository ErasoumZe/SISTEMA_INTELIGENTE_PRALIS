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

// --- Descontos da discriminacao em 3 NIVEIS (PROJECT_BRAIN/17 §5) ---------------------------
// Niveis 1 e 2 vivem no ITEM; o nivel 3 (geral) vive no CABECALHO do lancamento. Em todos,
// tipo null = sem desconto naquele nivel; os niveis sao CUMULATIVOS.
const descontosPorNivelItem = {
  // Nivel 1 — desconto no V.UNIT (R$ POR UNIDADE quando tipo='valor'). Nao rateia nada.
  descontoTipo: text("desconto_tipo"),
  descontoValor: numeric("desconto_valor", { precision: 14, scale: 4 }),
  // Nivel 2 — desconto no V.TOTAL do item; recalcula o unitario daquele item (D4).
  descontoTotalTipo: text("desconto_total_tipo"),
  descontoTotalValor: numeric("desconto_total_valor", { precision: 14, scale: 4 })
};

// Resultado do calculo dos tres niveis, gravado pelo servidor (nunca pelo cliente).
//
// FONTE DA VERDADE: `valor_total_com_desconto` e AUTORITATIVO — e ele que soma e reconcilia com o
// valor do lancamento. `valor_unitario_com_desconto` e DERIVADO (total / quantidade, arredondado
// em centavos) e existe para custo e exibicao. unitario x quantidade PODE NAO reconciliar com o
// total por arredondamento (ex.: 3,30 / 4 = 0,825 -> 0,83; 0,83 x 4 = 3,32) e isso e ESPERADO.
// Nunca recalcule o total a partir do unitario.
const valoresComDescontoItem = {
  valorUnitarioComDesconto: numeric("valor_unitario_com_desconto", { precision: 14, scale: 4 }).notNull(),
  valorTotalComDesconto: valorMonetario("valor_total_com_desconto").notNull()
};

// Nivel 3 — desconto GERAL, no cabecalho. Guarda COMO foi informado (ex.: 17,5 + 'percentual');
// o R$ resolvido continua em `valor_desconto`, que e quem alimenta liquidoCentavos e os agregados.
const descontoGeralLancamento = {
  descontoGeralTipo: text("desconto_geral_tipo"),
  descontoGeralValor: numeric("desconto_geral_valor", { precision: 14, scale: 4 })
};

function checksDescontoGeral(tabela: string, tipo: AnyPgColumn, valor: AnyPgColumn) {
  return [
    check(`${tabela}_desconto_geral_tipo_check`, sql`${tipo} is null or ${tipo} in ('percentual', 'valor')`),
    check(`${tabela}_desconto_geral_valor_check`, sql`${valor} is null or ${valor} >= 0`)
  ];
}

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
  // Conta contabil do COFRE da empresa (origem da transferencia automatica de abertura do caixa).
  // Regra 5 (M1): mapeamento EXPLICITO; sem ela, a abertura com malote falha em vez de inventar conta.
  contaCofreId: uuid("conta_cofre_id").references((): AnyPgColumn => contas.id, { onDelete: "set null" }),
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

// contas (PROJECT_BRAIN/17, D8): conta com FUNDO. `saldo_inicial` e o ponto de partida declarado no
// cadastro (ex.: CONTA COFRE nasce com 10.000) — NAO e o saldo atual e NUNCA e sobrescrito pelos
// movimentos. O saldo atual e DERIVADO: saldo_inicial + entradas - saidas (ver saldoContaCentavos
// no shared). Guardar o saldo numa coluna mutavel foi descartado de proposito: ele sairia de sincronia
// no primeiro lancamento que falhasse no meio, e nao haveria como reconstruir a verdade.
export const contas = pgTable(
  "contas",
  {
    id: idUuid,
    empresaId,
    nome: text("nome").notNull(),
    saldoInicial: valorMonetario("saldo_inicial").notNull().default("0"),
    ativa: boolean("ativa").notNull().default(true),
    criadoEm,
    importadoDe: uuid("importado_de").references(() => empresas.id, { onDelete: "set null" }),
    idImportado: uuid("id_importado")
  },
  (table) => [check("contas_saldo_inicial_check", sql`${table.saldoInicial} >= 0`)]
);

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
    // Turno habitual do colaborador — pre-seleciona o turno na abertura do caixa (editavel no ato).
    turnoPadraoId: uuid("turno_padrao_id").references(() => turnos.id, { onDelete: "set null" }),
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

// Turnos de trabalho (ex.: Manha 06:00-14:00). Turno so existe COM horario (regra da reuniao 15/07).
// E filtro/pre-preenchimento; NAO vincula venda sozinho — o vinculo e sempre o periodo do caixa.
export const turnos = pgTable(
  "turnos",
  {
    id: idUuid,
    empresaId,
    nome: text("nome").notNull(),
    horaInicio: time("hora_inicio").notNull(),
    horaFim: time("hora_fim").notNull(),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm,
    atualizadoEm
  },
  (table) => [unique("turnos_empresa_nome_unica").on(table.empresaId, table.nome)]
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

// PATRIMONIO (PROJECT_BRAIN/17, D2) — cadastro MINIMO, espelhando a aba PATRIMONIO da planilha:
// grupos com sigla (FIS estrutura fisica, MAT materia prima, UTS utensilios, MAQ maquinas,
// MOB mobiliarios, EMB embalagens) e itens com marca/setor. Alimenta o campo Grupo da
// discriminacao quando o item e maquinario/manutencao (§5).
// A sigla NAO e travada nos seis valores: isto e um cadastro com CRUD, e travar no banco faria o
// "novo grupo" so saber falhar. Unica por empresa + formato (2-4 maiusculas).
export const gruposPatrimonio = pgTable(
  "grupos_patrimonio",
  {
    id: idUuid,
    empresaId,
    sig: text("sig").notNull(),
    nome: text("nome").notNull(),
    criadoEm
  },
  (table) => [
    unique("grupos_patrimonio_sig_unica").on(table.empresaId, table.sig),
    check("grupos_patrimonio_sig_check", sql`${table.sig} ~ '^[A-Z]{2,4}$'`)
  ]
);

export const patrimonioItens = pgTable(
  "patrimonio_itens",
  {
    id: idUuid,
    empresaId,
    grupoPatrimonioId: uuid("grupo_patrimonio_id")
      .notNull()
      .references(() => gruposPatrimonio.id),
    setorId: uuid("setor_id").references(() => setores.id, { onDelete: "set null" }),
    nome: text("nome").notNull(),
    marca: text("marca"),
    criadoEm
  },
  (table) => [
    index("patrimonio_itens_empresa_idx").on(table.empresaId),
    index("patrimonio_itens_grupo_idx").on(table.grupoPatrimonioId)
  ]
);

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
      sql`${table.tipoRegistro} in ('venda', 'pdv', 'cliente', 'produto', 'forma_pagamento', 'colaborador')`
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
    // O malote E o lacre (D3): o numero do lacre e a identidade unica do malote. Nao existe mais
    // "codigo do malote" nem o "saco". Vem impresso de fonte externa e e digitado pelo operador.
    numeroLacre: text("numero_lacre").notNull(),
    // Valor do malote (fundo/troco emprestado do cofre). Vira a divida do caixa na abertura (R8).
    valor: valorMonetario("valor").notNull().default("0"),
    // Ciclo do malote/lacre: disponivel -> em_uso (aberto num caixa ou usado numa sangria/retorno)
    // -> devolvido (M2). Um so ciclo (antes havia status duplo malote+lacre).
    status: text("status").notNull().default("disponivel"),
    criadoPor: text("criado_por"),
    criadoEm,
    importadoDe: uuid("importado_de").references(() => empresas.id, { onDelete: "set null" }),
    idImportado: uuid("id_importado")
  },
  (table) => [
    uniqueIndex("malotes_empresa_numero_lacre_unico_idx").on(table.empresaId, sql`lower(${table.numeroLacre})`),
    check("malotes_status_check", sql`${table.status} in ('disponivel', 'em_uso', 'devolvido')`)
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
    // Vendedor/atendente cru da automacao (CREARE): identificador do de-para + texto do posto de caixa.
    // Guardado sempre, mesmo sem vinculo resolvido (auditoria e pendencia "sem conversao").
    colaboradorAutomacaoId: text("colaborador_automacao_id"),
    colaboradorAutomacao: text("colaborador_automacao"),
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
    index("vendas_caixa_idx").on(table.caixaId),
    // Suporta a revinculacao retroativa: achar vendas ORFAS (caixa_id NULL) de um PDV num intervalo.
    index("vendas_orfas_pdv_data_idx")
      .on(table.empresaId, table.pdvId, table.dataVenda)
      .where(sql`${table.caixaId} is null`)
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
    ...descontoGeralLancamento,
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
    ...checksDescontoGeral("despesas", table.descontoGeralTipo, table.descontoGeralValor),
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
    // Grupo do item vindo do cadastro de PATRIMONIO (§5: "se maquinario/manutencao"). Precisa ser
    // coluna PROPRIA: grupo_despesa_id e FK de grupos_despesas e nao aceita um id de patrimonio —
    // gravar la daria erro de FK, ou pior, casaria com um grupo de despesa de mesmo id.
    // As duas sao OPCIONAIS e MUTUAMENTE EXCLUSIVAS (check abaixo): item sem grupo e legitimo e
    // existe aos milhares no historico, entao a regra e "no maximo um", nunca "exatamente um".
    grupoPatrimonioId: uuid("grupo_patrimonio_id").references(() => gruposPatrimonio.id),
    colaboradorId: uuid("colaborador_id").references(() => colaboradores.id),
    descricao: text("descricao").notNull(),
    // Quantidade/unitario chegaram com os 3 niveis de desconto (§5): item antigo = 1 x valor.
    quantidade: numeric("quantidade", { precision: 14, scale: 3 }).notNull().default("1"),
    valorUnitario: numeric("valor_unitario", { precision: 14, scale: 4 }).notNull().default("0"),
    ...descontosPorNivelItem,
    valor: valorMonetario("valor").notNull(),
    ...valoresComDescontoItem
  },
  (table) => [
    check("despesas_itens_valor_check", sql`${table.valor} >= 0`),
    check("despesas_itens_quantidade_check", sql`${table.quantidade} > 0`),
    check("despesas_itens_valor_unitario_check", sql`${table.valorUnitario} >= 0`),
    check(
      "despesas_itens_desconto_tipo_check",
      sql`${table.descontoTipo} is null or ${table.descontoTipo} in ('percentual', 'valor')`
    ),
    check("despesas_itens_desconto_valor_check", sql`${table.descontoValor} is null or ${table.descontoValor} >= 0`),
    check(
      "despesas_itens_desconto_total_tipo_check",
      sql`${table.descontoTotalTipo} is null or ${table.descontoTotalTipo} in ('percentual', 'valor')`
    ),
    check(
      "despesas_itens_desconto_total_valor_check",
      sql`${table.descontoTotalValor} is null or ${table.descontoTotalValor} >= 0`
    ),
    check(
      "despesas_itens_valor_com_desconto_check",
      sql`${table.valorTotalComDesconto} >= 0 and ${table.valorUnitarioComDesconto} >= 0`
    ),
    // O grupo do item vem de UMA origem so: despesas OU patrimonio. Nenhum e permitido (item sem
    // grupo, o caso do historico); os dois juntos nao — seria um item em duas arvores de grupo, e
    // qualquer relatorio que agrupe contaria ele duas vezes.
    check(
      "despesas_itens_grupo_unico_check",
      sql`num_nonnulls(${table.grupoDespesaId}, ${table.grupoPatrimonioId}) <= 1`
    ),
    index("despesas_itens_despesa_idx").on(table.despesaId),
    // Parcial: a coluna e esparsa (so item de maquinario/manutencao preenche). Serve o DELETE de
    // grupos_patrimonio (FK sem indice varre a tabela filha inteira) e o filtro por grupo.
    index("despesas_itens_grupo_patrimonio_idx")
      .on(table.grupoPatrimonioId)
      .where(sql`${table.grupoPatrimonioId} is not null`)
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
    ...descontoGeralLancamento,
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
    ...checksDescontoGeral("mercadorias", table.descontoGeralTipo, table.descontoGeralValor),
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
    // Ver a nota em despesas_itens.grupo_patrimonio_id: mesma regra, mesmo motivo (FK diferente).
    grupoPatrimonioId: uuid("grupo_patrimonio_id").references(() => gruposPatrimonio.id),
    unidadeMedidaId: uuid("unidade_medida_id").references(() => unidadesMedida.id),
    descricao: text("descricao").notNull(),
    quantidade: numeric("quantidade", { precision: 14, scale: 3 }).notNull(),
    valorUnitario: numeric("valor_unitario", { precision: 14, scale: 4 }).notNull().default("0"),
    ...descontosPorNivelItem,
    // valor_total = V.Total do item ja LIQUIDO dos descontos DE ITEM (niveis 1 e 2). E a soma dele
    // que a validacao D5 compara com o valor do lancamento.
    valorTotal: valorMonetario("valor_total").notNull(),
    ...valoresComDescontoItem
  },
  (table) => [
    check("mercadorias_itens_quantidade_check", sql`${table.quantidade} > 0`),
    check("mercadorias_itens_valor_total_check", sql`${table.valorTotal} >= 0`),
    check(
      "mercadorias_itens_desconto_tipo_check",
      sql`${table.descontoTipo} is null or ${table.descontoTipo} in ('percentual', 'valor')`
    ),
    check("mercadorias_itens_desconto_valor_check", sql`${table.descontoValor} is null or ${table.descontoValor} >= 0`),
    check(
      "mercadorias_itens_desconto_total_tipo_check",
      sql`${table.descontoTotalTipo} is null or ${table.descontoTotalTipo} in ('percentual', 'valor')`
    ),
    check(
      "mercadorias_itens_desconto_total_valor_check",
      sql`${table.descontoTotalValor} is null or ${table.descontoTotalValor} >= 0`
    ),
    check(
      "mercadorias_itens_valor_com_desconto_check",
      sql`${table.valorTotalComDesconto} >= 0 and ${table.valorUnitarioComDesconto} >= 0`
    ),
    // Mesma regra de despesas_itens: no maximo uma origem de grupo (mercadorias OU patrimonio).
    check(
      "mercadorias_itens_grupo_unico_check",
      sql`num_nonnulls(${table.grupoMercadoriaId}, ${table.grupoPatrimonioId}) <= 1`
    ),
    index("mercadorias_itens_mercadoria_idx").on(table.mercadoriaId),
    index("mercadorias_itens_grupo_patrimonio_idx")
      .on(table.grupoPatrimonioId)
      .where(sql`${table.grupoPatrimonioId} is not null`)
  ]
);

// Notas fiscais eletronicas importadas do webhook da contabilidade (NF-e por CNPJ/periodo).
// Guarda a NF-e crua como fonte da verdade e ancora de idempotencia (unica por empresa+chave);
// a mercadoria pre-preenchida (cabecalho+itens, status 'aguardando_aprovacao') referencia esta
// nota via mercadoria_id. Fornecedor casado por CNPJ (criado se nao existir).
export const notasFiscais = pgTable(
  "notas_fiscais",
  {
    id: idUuid,
    empresaId,
    chave: text("chave").notNull(), // 44 digitos, sem o prefixo "NFe"
    numero: text("numero"),
    serie: text("serie"),
    modelo: text("modelo"),
    naturezaOperacao: text("natureza_operacao"),
    dataEmissao: timestamp("data_emissao", { withTimezone: true }),
    fornecedorCnpj: text("fornecedor_cnpj"),
    fornecedorNome: text("fornecedor_nome"),
    fornecedorId: uuid("fornecedor_id").references(() => fornecedores.id),
    valorProdutos: valorMonetario("valor_produtos"),
    valorDesconto: valorMonetario("valor_desconto"),
    valorFrete: valorMonetario("valor_frete"),
    valorOutros: valorMonetario("valor_outros"),
    valorSeguro: valorMonetario("valor_seguro"),
    valorTotal: valorMonetario("valor_total"),
    dataVencimento: date("data_vencimento"),
    mercadoriaId: uuid("mercadoria_id").references(() => mercadorias.id, { onDelete: "set null" }),
    payloadHash: text("payload_hash"),
    statusImportacao: text("status_importacao").notNull().default("pendente_revisao"),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    check(
      "notas_fiscais_status_importacao_check",
      sql`${table.statusImportacao} in ('pendente_revisao', 'revisada', 'ignorada', 'cancelada')`
    ),
    unique("notas_fiscais_empresa_chave_unica").on(table.empresaId, table.chave),
    index("notas_fiscais_empresa_status_idx").on(table.empresaId, table.statusImportacao)
  ]
);

// Itens fiscais da NF-e (nItem/EAN/NCM/CFOP/CEST/uCom/qCom/vUnCom). Detalhe que mercadorias_itens
// nao carrega — fica ligado ao cabecalho da nota; a tela de revisao junta por nota_fiscal_id.
export const notasFiscaisItens = pgTable(
  "notas_fiscais_itens",
  {
    id: idUuid,
    notaFiscalId: uuid("nota_fiscal_id")
      .notNull()
      .references(() => notasFiscais.id, { onDelete: "cascade" }),
    numeroItem: integer("numero_item"),
    ean: text("ean"), // cEAN
    ncm: text("ncm"),
    cfop: text("cfop"),
    cest: text("cest"),
    descricao: text("descricao"), // xProd
    unidadeComercial: text("unidade_comercial"), // uCom
    quantidade: numeric("quantidade", { precision: 14, scale: 4 }), // qCom
    valorUnitario: numeric("valor_unitario", { precision: 14, scale: 6 }), // vUnCom
    criadoEm
  },
  (table) => [index("notas_fiscais_itens_nota_idx").on(table.notaFiscalId)]
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
    // O malote/lacre envolvido na transferencia (abertura usa o malote de abertura; sangria/retorno
    // usa o malote-selo da volta). Antes havia um lacre_malote_id separado — agora malote === lacre.
    maloteId: uuid("malote_id").references(() => malotes.id),
    // Papel da transferencia: abertura (cofre->caixa, automatica no M1), suprimento/sangria/retorno
    // (manuais, R4/R6). Default 'suprimento' para linhas existentes (nao-destrutivo).
    tipo: text("tipo").notNull().default("suprimento"),
    // M2 (rascunho Rodrigo): data REAL do movimento fisico (separada de dataReferencia contabil e do
    // criadoEm), vencimento e classificacao contabil (paridade com o lancamento da planilha), e o
    // ordinal 1a/2a/3a/4a por caixa+tipo (R6). O vinculo caixa+dia e o caixaId ja existente.
    dataTransferencia: date("data_transferencia"),
    vencimento: date("vencimento"),
    contabil: text("contabil"),
    ordem: integer("ordem"),
    computar: boolean("computar").notNull().default(true),
    status: text("status").notNull().default("aprovado"),
    criadoPor: text("criado_por"),
    criadoEm,
    atualizadoEm
  },
  (table) => [
    check("transferencias_status_check", sql`${table.status} in ('aprovado', 'aguardando_aprovacao', 'cancelado')`),
    check("transferencias_tipo_check", sql`${table.tipo} in ('abertura', 'suprimento', 'sangria', 'retorno')`),
    check("transferencias_ordem_check", sql`${table.ordem} is null or ${table.ordem} >= 1`),
    check("transferencias_valor_original_check", sql`${table.valorOriginal} >= 0`),
    check("transferencias_valor_acrescimo_check", sql`${table.valorAcrescimo} >= 0`),
    check("transferencias_valor_desconto_check", sql`${table.valorDesconto} >= 0`),
    check("transferencias_contas_diferentes_check", sql`${table.contaOrigemId} <> ${table.contaDestinoId}`),
    index("transferencias_empresa_data_idx").on(table.empresaId, table.dataReferencia),
    index("transferencias_caixa_idx").on(table.caixaId)
  ]
);

// contas_usuarios (FOTO 4 do PROJECT_BRAIN/14): vinculo N:N usuario<->conta. Define QUAIS contas cada
// usuario pode operar (as que aparecem como Origem/Destino numa transferencia) e QUEM pode confirmar o
// recebimento de uma transferencia destinada aquela conta. NAO e permissao de tela (isso sao as 9 acoes
// por dominio) — e ESCOPO DE CONTA por usuario; as duas coisas sao complementares. Reconstrucao do
// trabalho de 24/07 (a tabela chegou a existir mas nunca foi commitada).
export const contasUsuarios = pgTable(
  "contas_usuarios",
  {
    id: idUuid,
    empresaId,
    contaId: uuid("conta_id")
      .notNull()
      .references(() => contas.id, { onDelete: "cascade" }),
    usuarioId: text("usuario_id")
      .notNull()
      .references(() => perfisUsuarios.usuarioId, { onDelete: "cascade" }),
    criadoEm
  },
  (table) => [
    unique("contas_usuarios_unica").on(table.contaId, table.usuarioId),
    index("contas_usuarios_usuario_idx").on(table.usuarioId),
    index("contas_usuarios_conta_idx").on(table.contaId)
  ]
);

// lacres: registro UNICO do lacre de um MOVIMENTO (a saida de uma transferencia OU cada linha de
// retorno/sangria). O numero vem impresso de fonte externa, e digitado pelo operador e nao se repete
// por empresa. `rompido` vira true quando o lacre e usado para receber/abrir no destino (o selo e
// quebrado) — a partir dai nunca mais pode ser reutilizado. Reconstrucao do trabalho de 24/07.
//
// DISTINCAO de `malotes.numero_lacre` (sao coisas diferentes, nao confundir):
//   - `malotes.numero_lacre` = IDENTIDADE do malote-ENTIDADE (o objeto fisico cadastrado, colapsado
//     com o lacre na D3). E cadastro de objeto reutilizavel.
//   - `lacres.numero`        = selo de um EVENTO de transporte: a prova de que UMA transferencia
//     especifica saiu lacrada e foi recebida. E o "lacre do setor" da FOTO 1.
export const lacres = pgTable(
  "lacres",
  {
    id: idUuid,
    empresaId,
    numero: text("numero").notNull(),
    transferenciaId: uuid("transferencia_id").references(() => transferencias.id, { onDelete: "set null" }),
    // Ponta do movimento que o lacre selou: 'saida' (ida da transferencia) ou 'retorno' (volta/sangria).
    origem: text("origem").notNull(),
    rompido: boolean("rompido").notNull().default(false),
    criadoEm
  },
  (table) => [
    check("lacres_origem_check", sql`${table.origem} in ('saida', 'retorno')`),
    unique("lacres_numero_unico").on(table.empresaId, table.numero),
    index("lacres_transf_idx").on(table.transferenciaId)
  ]
);

export const fechamentosCaixa = pgTable(
  "fechamentos_caixa",
  {
    id: idUuid,
    empresaId,
    pdvId: uuid("pdv_id").references(() => pdvs.id),
    // Turno da abertura (pre-selecionado pelo turno padrao do colaborador). Filtro/relatorio;
    // NAO governa o vinculo de vendas — quem manda e o periodo [abertura, fechamento] do caixa.
    turnoId: uuid("turno_id").references(() => turnos.id, { onDelete: "set null" }),
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
    // Abertura com malote (M1, R8): malote selecionado, lacre da ida e a divida com o cofre
    // (= valor do malote). divida_cofre NAO entra na formula canonica de saldo (ADR-001 intacto);
    // e a base do "saldo proprio" derivado. Caixas sem malote ficam com divida_cofre = 0.
    maloteAberturaId: uuid("malote_abertura_id").references(() => malotes.id),
    lacreAbertura: text("lacre_abertura"),
    dividaCofre: valorMonetario("divida_cofre").notNull().default("0"),
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
  // Nullable: alteracao por permissao direta (gerente/admin) nao consome token. No fluxo por token,
  // guarda o token efetivamente usado (o tokenEdicao antigo do gerente ou o token de autorizacao).
  tokenUsado: text("token_usado"),
  // Quem autorizou a alteracao (fluxo por token). Na permissao direta e o proprio editor.
  autorizadorId: text("autorizador_id").references(() => perfisUsuarios.usuarioId),
  // Motivo obrigatorio da alteracao de horario (auditoria).
  observacao: text("observacao"),
  editadoPor: text("editado_por").references(() => perfisUsuarios.usuarioId),
  editadoEm: timestamp("editado_em", { withTimezone: true }).notNull().defaultNow(),
  valoresAntigos: jsonb("valores_antigos").notNull(),
  valoresNovos: jsonb("valores_novos").notNull()
});

// Fluxo de autorizacao para alterar horario do caixa (reuniao 15/07): o operador solicita escolhendo
// um autorizador (usuario com caixa_alterar_horario); o autorizador gera um token curto — guardado
// APENAS como SHA-256 — que o operador usa UMA vez, em ate 15 min, para alterar o horario com
// observacao obrigatoria. Gerente/admin com a permissao alteram direto, sem passar por aqui.
export const caixaAutorizacoes = pgTable(
  "caixa_autorizacoes",
  {
    id: idUuid,
    caixaId: uuid("caixa_id")
      .notNull()
      .references(() => fechamentosCaixa.id, { onDelete: "cascade" }),
    solicitanteId: text("solicitante_id")
      .notNull()
      .references(() => perfisUsuarios.usuarioId),
    autorizadorId: text("autorizador_id")
      .notNull()
      .references(() => perfisUsuarios.usuarioId),
    tokenHash: text("token_hash"),
    status: text("status").notNull().default("pendente"),
    observacao: text("observacao"),
    expiraEm: timestamp("expira_em", { withTimezone: true }),
    criadoEm
  },
  (table) => [
    check("caixa_autorizacoes_status_check", sql`${table.status} in ('pendente', 'usada', 'expirada', 'negada')`),
    index("caixa_autorizacoes_autorizador_status_idx").on(table.autorizadorId, table.status)
  ]
);

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
